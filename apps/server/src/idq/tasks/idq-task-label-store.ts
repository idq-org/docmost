import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { LabelRepo, LabelType } from '@docmost/db/repos/label/label.repo';
import { executeTx } from '@docmost/db/utils';
import { EventName } from '../../common/events/event.contants';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import {
  ParsedTaskLabels,
  STATUS_PREFIX,
  TASK_LABEL_PREFIXES,
  TaskLabelPrefix,
  TaskStatus,
  parseTaskLabels,
  statusLabelName,
} from './idq-task-fields';

export type StoredTask = ParsedTaskLabels & {
  pageId: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  spaceId: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Reads and writes the task fields stored as page labels (see
 * idq-task-fields.ts). It uses Docmost's label tables and repository, so the
 * labels stay the same ones that the page details and the label pages show.
 */
@Injectable()
export class IdqTaskLabelStore {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly labelRepo: LabelRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Tasks of a space: pages that aren't deleted and have a status label.
   * It doesn't check permissions: the caller filters the pages.
   */
  async findSpaceTasks(
    spaceId: string,
    workspaceId: string,
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
      .where((eb) =>
        eb.or(
          TASK_LABEL_PREFIXES.map((prefix) =>
            eb('labels.name', 'like', `${prefix}%`),
          ),
        ),
      )
      .execute();

    return this.groupByPage(rows).filter((task) => task.statusValue !== null);
  }

  /** Task fields of one page; statusValue is null if it isn't a task. */
  async findPageTask(pageId: string): Promise<ParsedTaskLabels> {
    const fields = await this.findPagesTasks([pageId]);
    return fields.get(pageId);
  }

  /** Task fields of each page; statusValue is null if it isn't a task. */
  async findPagesTasks(
    pageIds: string[],
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
        .where((eb) =>
          eb.or(
            TASK_LABEL_PREFIXES.map((prefix) =>
              eb('labels.name', 'like', `${prefix}%`),
            ),
          ),
        )
        .execute();
      for (const row of rows) names.get(row.pageId)?.push(row.name);
    }
    return new Map([...names].map(([id, list]) => [id, parseTaskLabels(list)]));
  }

  /**
   * Replaces the page's status labels with the one of `status`. Status
   * labels left without pages are deleted, as Docmost does when a label is
   * removed from its last page.
   */
  async setStatus(
    pageId: string,
    workspaceId: string,
    status: TaskStatus,
  ): Promise<void> {
    await this.replaceFields(pageId, workspaceId, {
      [STATUS_PREFIX]: [statusLabelName(status).slice(STATUS_PREFIX.length)],
    });
  }

  /**
   * Replaces, for each given prefix, the page's labels with that prefix by
   * the given values, in a single transaction. Prefixes not given are left
   * alone. Labels left without pages are deleted.
   */
  async replaceFields(
    pageId: string,
    workspaceId: string,
    fields: Partial<Record<TaskLabelPrefix, string[]>>,
  ): Promise<void> {
    const prefixes = Object.keys(fields) as TaskLabelPrefix[];
    if (prefixes.length === 0) return;

    await executeTx(this.db, async (trx) => {
      // Serializes concurrent changes to the same task.
      await sql`select pg_advisory_xact_lock(hashtext(${'idq-task:' + pageId}))`.execute(
        trx,
      );

      const current = await trx
        .selectFrom('pageLabels')
        .innerJoin('labels', 'labels.id', 'pageLabels.labelId')
        .select(['labels.id', 'labels.name'])
        .where('pageLabels.pageId', '=', pageId)
        .where('labels.workspaceId', '=', workspaceId)
        .where('labels.type', '=', LabelType.PAGE)
        .where((eb) =>
          eb.or(
            prefixes.map((prefix) => eb('labels.name', 'like', `${prefix}%`)),
          ),
        )
        .execute();

      const wanted = new Set(
        prefixes.flatMap((prefix) =>
          (fields[prefix] ?? []).map((value) => prefix + value),
        ),
      );

      for (const name of wanted) {
        const label = await this.labelRepo.findOrCreate(
          name,
          workspaceId,
          LabelType.PAGE,
          trx,
        );
        await this.labelRepo.addLabelToPage(pageId, label.id, trx);
      }

      for (const label of current) {
        if (wanted.has(label.name)) continue;
        await this.labelRepo.removeLabelFromPage(
          pageId,
          label.id,
          workspaceId,
          trx,
        );
        const count = await this.labelRepo.getLabelPageCount(
          label.id,
          workspaceId,
          trx,
        );
        if (count === 0) {
          await this.labelRepo.deleteLabel(label.id, workspaceId, trx);
        }
      }
    });

    // Same event as Docmost's label endpoints (search index, page cache).
    this.eventEmitter.emit(EventName.PAGE_UPDATED, {
      pageIds: [pageId],
      workspaceId,
    });
  }

  /**
   * Values of the task labels on pages the user can reach by space (like
   * Docmost's label list, page restrictions don't narrow it), for the
   * pickers of the task panel.
   */
  async usedValues(
    workspaceId: string,
    userId: string,
  ): Promise<Record<TaskLabelPrefix, string[]>> {
    const rows = await this.db
      .selectFrom('labels')
      .select('labels.name')
      .distinct()
      .innerJoin('pageLabels', 'pageLabels.labelId', 'labels.id')
      .innerJoin('pages', 'pages.id', 'pageLabels.pageId')
      .where('labels.workspaceId', '=', workspaceId)
      .where('labels.type', '=', LabelType.PAGE)
      .where('pages.deletedAt', 'is', null)
      .where(
        'pages.spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(userId),
      )
      .where((eb) =>
        eb.or(
          TASK_LABEL_PREFIXES.map((prefix) =>
            eb('labels.name', 'like', `${prefix}%`),
          ),
        ),
      )
      .execute();

    const values = Object.fromEntries(
      TASK_LABEL_PREFIXES.map((prefix) => [prefix, [] as string[]]),
    ) as Record<TaskLabelPrefix, string[]>;
    for (const { name } of rows) {
      const prefix = TASK_LABEL_PREFIXES.find((p) => name.startsWith(p));
      const value = name.slice(prefix.length);
      if (value) values[prefix].push(value);
    }
    for (const prefix of TASK_LABEL_PREFIXES) values[prefix].sort();
    return values;
  }

  /**
   * The parent page that holds most tasks of the space (the index page, in
   * the association's spaces), or null when most are at the root.
   */
  async usualTaskParent(
    spaceId: string,
    workspaceId: string,
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
            .where('labels.name', 'like', `${STATUS_PREFIX}%`),
        ),
      )
      .groupBy('pages.parentPageId')
      .orderBy('count', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.parentPageId ?? null;
  }

  private groupByPage(
    rows: Array<
      Omit<StoredTask, keyof ParsedTaskLabels> & { labelName: string }
    >,
  ): StoredTask[] {
    const pages = new Map<
      string,
      { row: (typeof rows)[number]; names: string[] }
    >();
    for (const row of rows) {
      const entry = pages.get(row.pageId) ?? { row, names: [] };
      entry.names.push(row.labelName);
      pages.set(row.pageId, entry);
    }

    return [...pages.values()].map(({ row, names }) => {
      const { labelName, ...page } = row;
      return { ...page, ...parseTaskLabels(names) };
    });
  }
}
