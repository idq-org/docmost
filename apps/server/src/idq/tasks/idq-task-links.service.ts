import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { isUUID } from 'class-validator';
import { Page, User } from '@docmost/db/types/entity.types';
import { IdqKyselyDB, IdqTaskLinkType } from '../database/idq-db.types';
import { IdqTaskAccess } from './idq-task-access';

export const MAX_LINKS_PER_TASK = 100;

export type TaskLinkView = {
  id: string;
  type: IdqTaskLinkType;
  title: string;
  url: string | null;
  page: {
    id: string;
    slugId: string;
    title: string | null;
    icon: string | null;
    spaceSlug: string | null;
    spaceName: string | null;
  } | null;
  attachment: {
    id: string;
    fileName: string;
    mimeType: string | null;
    fileSize: number | null;
  } | null;
  createdAt: Date;
};

/** A page that links to another one, as material. */
export type LinkingPage = {
  taskPageId: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  spaceSlug: string | null;
  spaceName: string | null;
};

export type AddTaskLinkInput = {
  type: IdqTaskLinkType;
  targetPageId?: string;
  attachmentId?: string;
  url?: string;
  title?: string;
};

/**
 * Materials linked to a task: pages, attachments and external links. This
 * service knows links, not tasks: the board checks that a page is a task.
 *
 * Linked pages and attachments keep their own permissions: a viewer only
 * sees (and counts) the ones they could open anyway.
 */
@Injectable()
export class IdqTaskLinksService {
  constructor(
    @InjectKysely() private readonly db: IdqKyselyDB,
    private readonly access: IdqTaskAccess,
  ) {}

  /** Visible links of a task. The caller has checked access to the task. */
  async listForTask(
    taskPageId: string,
    user: User,
    workspaceId: string,
  ): Promise<TaskLinkView[]> {
    const rows = await this.linkRows([taskPageId], workspaceId);
    const visible = await this.visibleRows(rows, user, workspaceId);
    return visible.map((row) => this.toView(row));
  }

  /** Number of visible links per task. */
  async countForTasks(
    taskPageIds: string[],
    user: User,
    workspaceId: string,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (taskPageIds.length === 0) return counts;
    const rows = await this.linkRows(taskPageIds, workspaceId);
    const visible = await this.visibleRows(rows, user, workspaceId);
    for (const row of visible) {
      counts.set(row.taskPageId, (counts.get(row.taskPageId) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Pages that link this page as material, among those the user can see.
   * The caller has checked access to the page.
   */
  async linkingPages(
    pageId: string,
    user: User,
    workspaceId: string,
  ): Promise<LinkingPage[]> {
    const rows = await this.db
      .selectFrom('idqTaskLinks')
      .innerJoin('pages', 'pages.id', 'idqTaskLinks.taskPageId')
      .innerJoin('spaces', 'spaces.id', 'pages.spaceId')
      .select([
        'pages.id as taskPageId',
        'pages.slugId',
        'pages.title',
        'pages.icon',
        'spaces.slug as spaceSlug',
        'spaces.name as spaceName',
      ])
      .where('idqTaskLinks.targetPageId', '=', pageId)
      .where('idqTaskLinks.workspaceId', '=', workspaceId)
      .where('pages.deletedAt', 'is', null)
      .orderBy('pages.title')
      .execute();
    if (rows.length === 0) return [];

    const visible = await this.access.visiblePageIds(
      rows.map((r) => r.taskPageId),
      user.id,
      workspaceId,
    );
    return rows.filter((r) => visible.has(r.taskPageId));
  }

  /**
   * Links a material to a task page that the caller has found editable and
   * checked to be a task.
   */
  async add(
    task: Page,
    input: AddTaskLinkInput,
    user: User,
    workspaceId: string,
  ): Promise<TaskLinkView> {
    const { count } = await this.db
      .selectFrom('idqTaskLinks')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('taskPageId', '=', task.id)
      .executeTakeFirstOrThrow();
    if (Number(count) >= MAX_LINKS_PER_TASK) {
      throw new BadRequestException(
        `A task can have at most ${MAX_LINKS_PER_TASK} linked materials`,
      );
    }

    const base = {
      workspaceId,
      taskPageId: task.id,
      createdById: user.id,
    };

    let id: string | undefined;
    if (input.type === 'page') {
      const target = await this.findVisibleTargetPage(
        input.targetPageId,
        user,
        workspaceId,
      );
      if (target === task.id) {
        throw new BadRequestException('A task cannot link to itself');
      }
      id = await this.insertOrFind(
        { ...base, type: 'page', targetPageId: target },
        'targetPageId',
        target,
      );
    } else if (input.type === 'attachment') {
      const attachmentId = await this.findVisibleAttachment(
        input.attachmentId,
        user,
        workspaceId,
      );
      id = await this.insertOrFind(
        { ...base, type: 'attachment', attachmentId },
        'attachmentId',
        attachmentId,
      );
    } else {
      if (!input.url) throw new BadRequestException('url is required');
      const row = await this.db
        .insertInto('idqTaskLinks')
        .values({
          ...base,
          type: 'url',
          url: input.url,
          title: input.title?.trim() || null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      id = row.id;
    }

    const [row] = await this.linkRows([task.id], workspaceId, id);
    return this.toView(row);
  }

  async remove(linkId: string, user: User, workspaceId: string) {
    const link = await this.db
      .selectFrom('idqTaskLinks')
      .select(['id', 'taskPageId'])
      .where('id', '=', linkId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    if (!link) throw new NotFoundException('Link not found');

    await this.access.findEditablePage(link.taskPageId, user, workspaceId);
    await this.db
      .deleteFrom('idqTaskLinks')
      .where('id', '=', link.id)
      .execute();
  }

  private async insertOrFind(
    values: {
      workspaceId: string;
      taskPageId: string;
      createdById: string;
      type: IdqTaskLinkType;
      targetPageId?: string;
      attachmentId?: string;
    },
    column: 'targetPageId' | 'attachmentId',
    targetId: string,
  ): Promise<string> {
    const inserted = await this.db
      .insertInto('idqTaskLinks')
      .values(values)
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();
    if (inserted) return inserted.id;

    const existing = await this.db
      .selectFrom('idqTaskLinks')
      .select('id')
      .where('taskPageId', '=', values.taskPageId)
      .where(column, '=', targetId)
      .executeTakeFirstOrThrow();
    return existing.id;
  }

  private async findVisibleTargetPage(
    pageId: string | undefined,
    user: User,
    workspaceId: string,
  ): Promise<string> {
    if (!pageId) throw new BadRequestException('targetPageId is required');
    const page = await this.db
      .selectFrom('pages')
      .select('id')
      .where(isUUID(pageId) ? 'id' : 'slugId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    const visible = page
      ? await this.access.visiblePageIds([page.id], user.id, workspaceId)
      : new Set<string>();
    if (!page || !visible.has(page.id)) {
      throw new NotFoundException('Page not found');
    }
    return page.id;
  }

  private async findVisibleAttachment(
    attachmentId: string | undefined,
    user: User,
    workspaceId: string,
  ): Promise<string> {
    if (!attachmentId) {
      throw new BadRequestException('attachmentId is required');
    }
    const attachment = await this.db
      .selectFrom('attachments')
      .select(['id', 'pageId'])
      .where('id', '=', attachmentId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('aiChatId', 'is', null)
      .executeTakeFirst();
    const visible = attachment?.pageId
      ? await this.access.visiblePageIds(
          [attachment.pageId],
          user.id,
          workspaceId,
        )
      : new Set<string>();
    if (!attachment?.pageId || !visible.has(attachment.pageId)) {
      throw new NotFoundException('Attachment not found');
    }
    return attachment.id;
  }

  /** Link rows with their target, without permission checks. */
  private async linkRows(
    taskPageIds: string[],
    workspaceId: string,
    id?: string,
  ): Promise<LinkRow[]> {
    const rows = await this.db
      .selectFrom('idqTaskLinks')
      .leftJoin('pages as target', 'target.id', 'idqTaskLinks.targetPageId')
      .leftJoin('spaces as targetSpace', 'targetSpace.id', 'target.spaceId')
      .leftJoin('attachments', 'attachments.id', 'idqTaskLinks.attachmentId')
      .select([
        'idqTaskLinks.id',
        'idqTaskLinks.type',
        'idqTaskLinks.taskPageId',
        'idqTaskLinks.url',
        'idqTaskLinks.title',
        'idqTaskLinks.createdAt',
        'idqTaskLinks.targetPageId',
        'target.slugId as targetSlugId',
        'target.title as targetTitle',
        'target.icon as targetIcon',
        'targetSpace.slug as targetSpaceSlug',
        'targetSpace.name as targetSpaceName',
        'idqTaskLinks.attachmentId',
        'attachments.pageId as attachmentPageId',
        'attachments.fileName as attachmentFileName',
        'attachments.mimeType as attachmentMimeType',
        'attachments.fileSize as attachmentFileSize',
        'attachments.deletedAt as attachmentDeletedAt',
      ])
      .where('idqTaskLinks.taskPageId', 'in', taskPageIds)
      .where('idqTaskLinks.workspaceId', '=', workspaceId)
      .$if(Boolean(id), (qb) => qb.where('idqTaskLinks.id', '=', id))
      .orderBy('idqTaskLinks.createdAt')
      .orderBy('idqTaskLinks.id')
      .execute();
    // Through the joins Kysely keeps our timestamp columns as ColumnType;
    // at runtime they are Dates.
    return rows as unknown as LinkRow[];
  }

  private async visibleRows(
    rows: LinkRow[],
    user: User,
    workspaceId: string,
  ): Promise<LinkRow[]> {
    const pageIds = rows.flatMap((row) =>
      row.type === 'page'
        ? [row.targetPageId]
        : row.type === 'attachment' && row.attachmentPageId
          ? [row.attachmentPageId]
          : [],
    );
    const visible = await this.access.visiblePageIds(
      pageIds,
      user.id,
      workspaceId,
    );

    return rows.filter((row) => {
      if (row.type === 'url') return true;
      if (row.type === 'page') return visible.has(row.targetPageId);
      return (
        !row.attachmentDeletedAt &&
        Boolean(row.attachmentPageId) &&
        visible.has(row.attachmentPageId)
      );
    });
  }

  private toView(row: LinkRow): TaskLinkView {
    const view: TaskLinkView = {
      id: row.id,
      type: row.type,
      title: '',
      url: null,
      page: null,
      attachment: null,
      createdAt: row.createdAt,
    };

    if (row.type === 'page') {
      view.page = {
        id: row.targetPageId,
        slugId: row.targetSlugId,
        title: row.targetTitle,
        icon: row.targetIcon,
        spaceSlug: row.targetSpaceSlug,
        spaceName: row.targetSpaceName,
      };
      view.title = row.targetTitle ?? '';
    } else if (row.type === 'attachment') {
      view.attachment = {
        id: row.attachmentId,
        fileName: row.attachmentFileName,
        mimeType: row.attachmentMimeType,
        fileSize:
          row.attachmentFileSize === null
            ? null
            : Number(row.attachmentFileSize),
      };
      view.title = row.attachmentFileName ?? '';
    } else {
      view.url = row.url;
      view.title = row.title || row.url || '';
    }
    return view;
  }
}

/** A link with what the viewer needs of its target. */
type LinkRow = {
  id: string;
  type: IdqTaskLinkType;
  taskPageId: string;
  url: string | null;
  title: string | null;
  createdAt: Date;
  targetPageId: string | null;
  targetSlugId: string | null;
  targetTitle: string | null;
  targetIcon: string | null;
  targetSpaceSlug: string | null;
  targetSpaceName: string | null;
  attachmentId: string | null;
  attachmentPageId: string | null;
  attachmentFileName: string | null;
  attachmentMimeType: string | null;
  attachmentFileSize: number | string | bigint | null;
  attachmentDeletedAt: Date | null;
};
