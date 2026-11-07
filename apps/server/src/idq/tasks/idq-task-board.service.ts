import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageController } from '../../core/page/page.controller';
import { CreatePageDto } from '../../core/page/dto/create-page.dto';
import { IdqTaskAccess } from './idq-task-access';
import { IdqTaskLabelStore, StoredTask } from './idq-task-label-store';
import {
  IdqTaskLinksService,
  TaskLinkView,
  TaskUsage,
} from './idq-task-links.service';
import { IdqTaskDeadlines, TaskDeadline } from './idq-task-deadlines';
import {
  AREA_PREFIX,
  ASSIGNEE_PREFIX,
  PRIORITY_PREFIX,
  TASK_STATUSES,
  TaskLabelPrefix,
  TaskStatus,
} from './idq-task-fields';
import {
  IdqTaskAssigneesService,
  TaskAssignee,
  WorkspaceMember,
} from './idq-task-assignees.service';

/** Emitted after a task changes column, for other IDQ features (#12). */
export const IDQ_TASK_STATUS_CHANGED = 'idq.task.status-changed';

export type IdqTaskStatusChangedEvent = {
  pageId: string;
  spaceId: string;
  workspaceId: string;
  userId: string;
  status: TaskStatus;
  previousStatus: TaskStatus | null;
};

export type BoardTask = {
  pageId: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  /** Known status, or null for a `stato-` label the board doesn't know. */
  status: TaskStatus | null;
  statusValue: string;
  priority: string | null;
  areas: string[];
  assignees: TaskAssignee[];
  nextDeadline: TaskDeadline | null;
  linkCount: number;
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskBoard = {
  space: { id: string; name: string; slug: string };
  statuses: readonly TaskStatus[];
  canCreate: boolean;
  tasks: BoardTask[];
};

export type TaskFieldsInput = {
  priority?: string | null;
  areas?: string[];
  assignees?: string[];
};

/** Values to choose from in the task panel. */
export type TaskFieldOptions = {
  priorities: string[];
  areas: string[];
  /** `ref-` values already in use, including names without an account. */
  assignees: TaskAssignee[];
  members: WorkspaceMember[];
};

export type PageTaskInfo = {
  pageId: string;
  isTask: boolean;
  canEdit: boolean;
  task: Omit<BoardTask, 'linkCount'> | null;
  links: TaskLinkView[];
  usedIn: TaskUsage[];
};

@Injectable()
export class IdqTaskBoardService implements OnModuleInit {
  private pageController: PageController;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly moduleRef: ModuleRef,
    private readonly eventEmitter: EventEmitter2,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly access: IdqTaskAccess,
    private readonly labelStore: IdqTaskLabelStore,
    private readonly links: IdqTaskLinksService,
    private readonly deadlines: IdqTaskDeadlines,
    private readonly assignees: IdqTaskAssigneesService,
  ) {}

  onModuleInit() {
    this.pageController = this.moduleRef.get(PageController, {
      strict: false,
    });
  }

  async getBoard(
    spaceId: string,
    user: User,
    workspace: Workspace,
  ): Promise<TaskBoard> {
    const { canEdit: canEditSpace } = await this.access.spacePermissions(
      user,
      spaceId,
    );
    const space = await this.db
      .selectFrom('spaces')
      .select(['id', 'name', 'slug'])
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspace.id)
      .executeTakeFirstOrThrow();

    const stored = await this.labelStore.findSpaceTasks(spaceId, workspace.id);
    const visible = await this.access.visiblePageIdsInSpace(
      stored.map((t) => t.pageId),
      user.id,
      spaceId,
    );
    const tasks = stored.filter((t) => visible.has(t.pageId));

    const editable = await this.editablePageIds(
      tasks.map((t) => t.pageId),
      user,
      spaceId,
      canEditSpace,
    );

    return {
      space,
      statuses: TASK_STATUSES,
      canCreate: canEditSpace,
      tasks: await this.toBoardTasks(tasks, user, workspace.id, editable),
    };
  }

  /** Task fields, links and "used in" of a page, for the panel in the page. */
  async getPageInfo(
    pageId: string,
    user: User,
    workspace: Workspace,
  ): Promise<PageTaskInfo> {
    const { page, canEdit } = await this.access.findViewablePage(
      pageId,
      user,
      workspace.id,
    );
    const fields = await this.labelStore.findPageTask(page.id);
    const isTask = fields.statusValue !== null;

    let task: PageTaskInfo['task'] = null;
    if (isTask) {
      const [boardTask] = await this.toBoardTasks(
        [
          {
            ...fields,
            pageId: page.id,
            slugId: page.slugId,
            title: page.title,
            icon: page.icon,
            spaceId: page.spaceId,
            createdAt: page.createdAt as Date,
            updatedAt: page.updatedAt as Date,
          },
        ],
        user,
        workspace.id,
        new Set(canEdit ? [page.id] : []),
        { withLinkCount: false },
      );
      const { linkCount, ...rest } = boardTask;
      task = rest;
    }

    return {
      pageId: page.id,
      isTask,
      canEdit,
      task,
      links: isTask
        ? await this.links.listForTask(page.id, user, workspace.id)
        : [],
      usedIn: await this.links.usedIn(page.id, user, workspace.id),
    };
  }

  async setStatus(
    pageId: string,
    status: TaskStatus,
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    const page = await this.access.findEditablePage(pageId, user, workspace.id);
    const fields = await this.labelStore.findPageTask(page.id);
    if (fields.statusValue === null) {
      throw new BadRequestException('The page is not a task');
    }
    if (fields.status === status) return;

    await this.labelStore.setStatus(page.id, workspace.id, status);

    const event: IdqTaskStatusChangedEvent = {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: workspace.id,
      userId: user.id,
      status,
      previousStatus: fields.status,
    };
    this.eventEmitter.emit(IDQ_TASK_STATUS_CHANGED, event);
  }

  /**
   * Creates a task page in the given column, under the page that holds the
   * other tasks of the space (the index page) or at the root.
   */
  async createTask(
    input: {
      spaceId: string;
      title: string;
      status: TaskStatus;
      /** Markdown of the new page, e.g. the sections of a task. */
      content?: string;
    },
    user: User,
    workspace: Workspace,
  ): Promise<BoardTask> {
    const { canEdit } = await this.access.spacePermissions(user, input.spaceId);
    if (!canEdit) throw new ForbiddenException();

    const parentPageId = await this.labelStore.usualTaskParent(
      input.spaceId,
      workspace.id,
    );
    const create = (parent: string | null) =>
      // Through Docmost's controller: same permission checks and audit log
      // as a page created from the sidebar.
      this.pageController.create(
        Object.assign(new CreatePageDto(), {
          spaceId: input.spaceId,
          title: input.title,
          parentPageId: parent ?? undefined,
          ...(input.content
            ? { content: input.content, format: 'markdown' as const }
            : {}),
        }),
        user,
        workspace,
      );

    let page: Awaited<ReturnType<typeof create>>;
    try {
      page = await create(parentPageId);
    } catch (err) {
      // A parent the user can't write under (page restrictions): use the root.
      if (!parentPageId || !(err instanceof ForbiddenException)) throw err;
      page = await create(null);
    }
    await this.labelStore.setStatus(page.id, workspace.id, input.status);

    const fields = await this.labelStore.findPageTask(page.id);
    const [task] = await this.toBoardTasks(
      [
        {
          ...fields,
          pageId: page.id,
          slugId: page.slugId,
          title: page.title,
          icon: page.icon,
          spaceId: page.spaceId,
          createdAt: page.createdAt as Date,
          updatedAt: page.updatedAt as Date,
        },
      ],
      user,
      workspace.id,
      new Set([page.id]),
    );
    return task;
  }

  /** Replaces priority, areas and people in charge of a task. */
  async setFields(
    pageId: string,
    input: TaskFieldsInput,
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    const page = await this.access.findEditablePage(pageId, user, workspace.id);
    const fields = await this.labelStore.findPageTask(page.id);
    if (fields.statusValue === null) {
      throw new BadRequestException('The page is not a task');
    }

    const changes: Partial<Record<TaskLabelPrefix, string[]>> = {};
    if (input.priority !== undefined) {
      changes[PRIORITY_PREFIX] = input.priority ? [input.priority] : [];
    }
    if (input.areas !== undefined) changes[AREA_PREFIX] = input.areas;
    if (input.assignees !== undefined) {
      changes[ASSIGNEE_PREFIX] = input.assignees;
    }
    await this.labelStore.replaceFields(page.id, workspace.id, changes);
  }

  async getFieldOptions(
    spaceId: string,
    user: User,
    workspace: Workspace,
  ): Promise<TaskFieldOptions> {
    await this.access.spacePermissions(user, spaceId);
    const [used, resolve, members] = await Promise.all([
      this.labelStore.usedValues(workspace.id, user.id),
      this.assignees.resolver(workspace.id),
      this.assignees.members(workspace.id),
    ]);
    return {
      priorities: used[PRIORITY_PREFIX],
      areas: used[AREA_PREFIX],
      assignees: used[ASSIGNEE_PREFIX].map(resolve),
      members,
    };
  }

  /**
   * Pages the user can edit. Readers can't move cards; for writers,
   * page-level restrictions decide.
   */
  private async editablePageIds(
    pageIds: string[],
    user: User,
    spaceId: string,
    canEditSpace: boolean,
  ): Promise<Set<string>> {
    if (!canEditSpace || pageIds.length === 0) return new Set();
    const restricted =
      await this.pagePermissionRepo.hasRestrictedPagesInSpace(spaceId);
    if (!restricted) return new Set(pageIds);

    const permissions =
      await this.pagePermissionRepo.filterAccessiblePageIdsWithPermissions(
        pageIds,
        user.id,
      );
    return new Set(permissions.filter((p) => p.canEdit).map((p) => p.id));
  }

  private async toBoardTasks(
    tasks: StoredTask[],
    user: User,
    workspaceId: string,
    editable: Set<string>,
    opts: { withLinkCount?: boolean } = {},
  ): Promise<BoardTask[]> {
    const pageIds = tasks.map((t) => t.pageId);
    const [deadlines, linkCounts, resolveAssignee] = await Promise.all([
      this.deadlines.nextOpenDeadlines(pageIds),
      opts.withLinkCount === false
        ? Promise.resolve(new Map<string, number>())
        : this.links.countForTasks(pageIds, user, workspaceId),
      this.assignees.resolver(workspaceId),
    ]);

    return tasks
      .map((t) => ({
        pageId: t.pageId,
        slugId: t.slugId,
        title: t.title,
        icon: t.icon,
        status: t.status,
        statusValue: t.statusValue,
        priority: t.priority,
        areas: t.areas,
        assignees: t.assignees.map(resolveAssignee),
        nextDeadline: deadlines.get(t.pageId) ?? null,
        linkCount: linkCounts.get(t.pageId) ?? 0,
        canEdit: editable.has(t.pageId),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
      .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  }
}
