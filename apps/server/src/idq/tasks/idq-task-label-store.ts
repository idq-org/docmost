import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { RawBuilder, sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { LabelType } from '@docmost/db/repos/label/label.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import {
  LABEL_NAME_MAX_LENGTH,
  ParsedTaskLabels,
  TASK_FIELDS,
  TASK_VALUE_FIELDS,
  TaskField,
  TaskFieldsUpdate,
  TaskStatus,
  TaskVocabulary,
  escapeLike,
  labelName,
  parseTaskLabels,
  planTaskLabels,
} from './idq-task-fields';
import { IdqDocmost } from '../core/idq-docmost.service';
import { IdqPageLock } from '../core/idq-page-lock.service';

export type StoredTask = ParsedTaskLabels & {
  pageId: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  spaceId: string;
  createdAt: Date;
  updatedAt: Date;
};

/** `labels.name` starts with the prefix of one of the fields. */
function labelOfFields(
  vocabulary: TaskVocabulary,
  fields: readonly TaskField[],
): RawBuilder<boolean> {
  const patterns = fields.map(
    (field) => escapeLike(vocabulary.prefixes[field]) + '%',
  );
  return sql<boolean>`(${sql.join(
    patterns.map((pattern) => sql`labels.name like ${pattern}`),
    sql` or `,
  )})`;
}

/**
 * Reads and writes the task fields stored as page labels (see
 * idq-task-fields.ts). Reads use Docmost's label tables; writes go through
 * Docmost's LabelService, so they behave like the labels section of a page
 * (events, search index, cleanup of labels left without pages).
 */
@Injectable()
export class IdqTaskLabelStore {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly docmost: IdqDocmost,
    private readonly pageLock: IdqPageLock,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  /**
   * Tasks of a space: pages that aren't deleted and have a status label.
   * It doesn't check permissions: the caller filters the pages.
   */
  async findSpaceTasks(
    spaceId: string,
    workspaceId: string,
    vocabulary: TaskVocabulary,
  ): Promise<StoredTask[]> {
    const rows = await this.db
      .selectFrom('pages')
      .innerJoin('pageLabels', 'pageLabels.pageId', 'pages.id')
      .innerJoin('labels', 'labels.id', 'pageLabels.labelId')
      .select([
        'pages.id as pageId',
        'pages.slugId',
        'pages.title',
        'pages.icon',
        'pages.spaceId',
        'pages.createdAt',
        'pages.updatedAt',
        'labels.name as labelName',
      ])
      .where('pages.spaceId', '=', spaceId)
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.deletedAt', 'is', null)
      .where('labels.workspaceId', '=', workspaceId)
      .where('labels.type', '=', LabelType.PAGE)
      .where(labelOfFields(vocabulary, TASK_FIELDS))
      .execute();

    const byPage = new Map<
      string,
      { row: (typeof rows)[number]; names: string[] }
    >();
    for (const row of rows) {
      const entry = byPage.get(row.pageId) ?? { row, names: [] };
      entry.names.push(row.labelName);
      byPage.set(row.pageId, entry);
    }

    const tasks: StoredTask[] = [];
    for (const { row, names } of byPage.values()) {
      const fields = parseTaskLabels(names, vocabulary);
      if (fields.statusValue === null) continue;
      tasks.push({
        pageId: row.pageId,
        slugId: row.slugId,
        title: row.title,
        icon: row.icon,
        spaceId: row.spaceId,
        createdAt: row.createdAt as Date,
        updatedAt: row.updatedAt as Date,
        ...fields,
      });
    }
    return tasks;
  }

  /** Task fields of one page; statusValue is null if it isn't a task. */
  async findPageTask(
    pageId: string,
    vocabulary: TaskVocabulary,
  ): Promise<ParsedTaskLabels> {
    return (await this.findPagesTasks([pageId], vocabulary)).get(pageId);
  }

  /** Task fields of each page; statusValue is null if it isn't a task. */
  async findPagesTasks(
    pageIds: string[],
    vocabulary: TaskVocabulary,
  ): Promise<Map<string, ParsedTaskLabels>> {
    const ids = [...new Set(pageIds)];
    const names = new Map<string, string[]>(ids.map((id) => [id, []]));
    if (ids.length > 0) {
      const rows = await this.db
        .selectFrom('pageLabels')
        .innerJoin('labels', 'labels.id', 'pageLabels.labelId')
        .select(['pageLabels.pageId', 'labels.name'])
        .where('pageLabels.pageId', 'in', ids)
        .where('labels.type', '=', LabelType.PAGE)
        .where(labelOfFields(vocabulary, TASK_FIELDS))
        .execute();
      for (const row of rows) names.get(row.pageId)?.push(row.name);
    }
    return new Map(
      [...names].map(([id, list]) => [id, parseTaskLabels(list, vocabulary)]),
    );
  }

  /**
   * Applies an update to the task fields of a page (see TaskFieldsUpdate)
   * and returns its status before and after.
   *
   * Changes to the same page are serialized with IdqPageLock, and the
   * current labels are read under that lock, so two quick moves can't leave
   * two status labels and the status before is the one really replaced.
   * The lock lives in this process: like IdqPageLock, this assumes the
   * server runs as a single instance.
   *
   * The labels are written with Docmost's LabelService, which uses one
   * transaction per call: labels are added first and removed after, so a
   * failure halfway never leaves a task without a status (at worst with an
   * old label too, which the next change removes).
   */
  async writeFields(
    pageId: string,
    workspaceId: string,
    vocabulary: TaskVocabulary,
    update: TaskFieldsUpdate,
  ): Promise<{
    previousStatus: TaskStatus | null;
    status: TaskStatus | null;
  }> {
    for (const field of TASK_VALUE_FIELDS) {
      for (const value of update[field] ?? []) {
        if (
          labelName(field, value, vocabulary).length > LABEL_NAME_MAX_LENGTH
        ) {
          throw new BadRequestException(`"${value}" is too long`);
        }
      }
    }

    return this.pageLock.run(pageId, async () => {
      const current = await this.db
        .selectFrom('pageLabels')
        .innerJoin('labels', 'labels.id', 'pageLabels.labelId')
        .select(['labels.id', 'labels.name'])
        .where('pageLabels.pageId', '=', pageId)
        .where('labels.workspaceId', '=', workspaceId)
        .where('labels.type', '=', LabelType.PAGE)
        .where(labelOfFields(vocabulary, TASK_FIELDS))
        .execute();

      const plan = planTaskLabels(
        current.map((label) => label.name),
        update,
        vocabulary,
      );

      if (plan.add.length > 0) {
        await this.docmost.labelService.addLabelsToPage(
          pageId,
          plan.add,
          workspaceId,
        );
      }
      const remove = new Set(plan.remove);
      for (const label of current) {
        if (remove.has(label.name)) {
          await this.docmost.labelService.removeLabelFromPage(
            pageId,
            label.id,
            workspaceId,
          );
        }
      }

      return { previousStatus: plan.before.status, status: plan.after.status };
    });
  }

  /**
   * Task labels on pages of the spaces the user belongs to (or of one of
   * them, with spaceId), with their page. The caller filters the pages the
   * user can open.
   */
  async labelsInUserSpaces(
    workspaceId: string,
    userId: string,
    vocabulary: TaskVocabulary,
    spaceId?: string,
  ): Promise<Array<{ pageId: string; name: string }>> {
    let query = this.db
      .selectFrom('labels')
      .innerJoin('pageLabels', 'pageLabels.labelId', 'labels.id')
      .innerJoin('pages', 'pages.id', 'pageLabels.pageId')
      .select(['pages.id as pageId', 'labels.name'])
      .where('labels.workspaceId', '=', workspaceId)
      .where('labels.type', '=', LabelType.PAGE)
      .where('pages.deletedAt', 'is', null)
      .where(
        'pages.spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(userId),
      )
      .where(labelOfFields(vocabulary, TASK_FIELDS));
    if (spaceId) query = query.where('pages.spaceId', '=', spaceId);
    return query.execute();
  }

  /**
   * The parent page that holds most tasks of the space (an index page, for
   * instance), or null when most are at the root. It doesn't check
   * permissions: the caller falls back to the root if the user can't write
   * under it.
   */
  async usualTaskParent(
    spaceId: string,
    workspaceId: string,
    vocabulary: TaskVocabulary,
  ): Promise<string | null> {
    const row = await this.db
      .selectFrom('pages')
      .select('pages.parentPageId')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('pages.spaceId', '=', spaceId)
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.deletedAt', 'is', null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('pageLabels')
            .innerJoin('labels', 'labels.id', 'pageLabels.labelId')
            .select('pageLabels.id')
            .whereRef('pageLabels.pageId', '=', 'pages.id')
            .where('labels.type', '=', LabelType.PAGE)
            .where(labelOfFields(vocabulary, ['status'])),
        ),
      )
      .groupBy('pages.parentPageId')
      .orderBy('count', 'desc')
      // On a tie, the parent of the newest task, then any fixed order.
      .orderBy((eb) => eb.fn.max('pages.createdAt'), 'desc')
      .orderBy('pages.parentPageId')
      .limit(1)
      .executeTakeFirst();
    return row?.parentPageId ?? null;
  }
}
