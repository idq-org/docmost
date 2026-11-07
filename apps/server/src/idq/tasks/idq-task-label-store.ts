import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectKysely } from 'nestjs-kysely';
import { RawBuilder, sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { LabelType } from '@docmost/db/repos/label/label.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { LabelService } from '../../core/label/label.service';
import {
  ParsedTaskLabels,
  TASK_FIELDS,
  TaskField,
  TaskStatus,
  TaskVocabulary,
  escapeLike,
  fieldOfLabel,
  parseTaskLabels,
} from './idq-task-fields';
import { KeyedMutex } from './keyed-mutex';

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
export class IdqTaskLabelStore implements OnModuleInit {
  private labelService: LabelService;
  private readonly pageLocks = new KeyedMutex();

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly moduleRef: ModuleRef,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  onModuleInit() {
    // LabelModule is imported by PageModule, not by us: same approach as
    // the IDQ MCP for core services.
    this.labelService = this.moduleRef.get(LabelService, { strict: false });
  }

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

  async setStatus(
    pageId: string,
    workspaceId: string,
    vocabulary: TaskVocabulary,
    status: TaskStatus,
  ): Promise<void> {
    await this.replaceFields(pageId, workspaceId, vocabulary, {
      status: [vocabulary.statuses[status][0]],
    });
  }

  /**
   * Replaces, for each given field, the page's labels of that field with the
   * given values. Fields not given are left alone. Changes to the same page
   * are serialized, so two quick moves can't leave two status labels.
   */
  async replaceFields(
    pageId: string,
    workspaceId: string,
    vocabulary: TaskVocabulary,
    changes: Partial<Record<TaskField, string[]>>,
  ): Promise<void> {
    const fields = TASK_FIELDS.filter((field) => changes[field] !== undefined);
    if (fields.length === 0) return;

    await this.pageLocks.run(pageId, async () => {
      const current = await this.db
        .selectFrom('pageLabels')
        .innerJoin('labels', 'labels.id', 'pageLabels.labelId')
        .select(['labels.id', 'labels.name'])
        .where('pageLabels.pageId', '=', pageId)
        .where('labels.workspaceId', '=', workspaceId)
        .where('labels.type', '=', LabelType.PAGE)
        .where(labelOfFields(vocabulary, fields))
        .execute();

      const wanted = new Set(
        fields.flatMap((field) =>
          changes[field].map((value) => vocabulary.prefixes[field] + value),
        ),
      );
      const present = new Set(current.map((label) => label.name));

      const toAdd = [...wanted].filter((name) => !present.has(name));
      if (toAdd.length > 0) {
        await this.labelService.addLabelsToPage(pageId, toAdd, workspaceId);
      }

      // Removed after adding, so a failure never leaves a task without a
      // status. The LIKE above can also match labels of another field with a
      // longer prefix: fieldOfLabel tells them apart.
      for (const label of current) {
        const field = fieldOfLabel(label.name, vocabulary)?.field;
        if (field && fields.includes(field) && !wanted.has(label.name)) {
          await this.labelService.removeLabelFromPage(
            pageId,
            label.id,
            workspaceId,
          );
        }
      }
    });
  }

  /**
   * Task labels on pages of the spaces the user belongs to, with their page.
   * The caller filters the pages the user can open.
   */
  async labelsInUserSpaces(
    workspaceId: string,
    userId: string,
    vocabulary: TaskVocabulary,
  ): Promise<Array<{ pageId: string; name: string }>> {
    return this.db
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
      .where(labelOfFields(vocabulary, TASK_FIELDS))
      .execute();
  }

  /**
   * The parent page that holds most tasks of the space (an index page, for
   * instance), or null when most are at the root.
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
      .limit(1)
      .executeTakeFirst();
    return row?.parentPageId ?? null;
  }
}
