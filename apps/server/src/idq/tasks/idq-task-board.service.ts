import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { Page, User, Workspace } from '@docmost/db/types/entity.types';
import { PageController } from '../../core/page/page.controller';
import { CreatePageDto } from '../../core/page/dto/create-page.dto';
import { IdqTaskAccess } from './idq-task-access';
import { IdqTaskLabelStore, StoredTask } from './idq-task-label-store';
import {
  AddTaskLinkInput,
  IdqTaskLinksService,
  LinkingPage,
  TaskLinkView,
} from './idq-task-links.service';
import {
  IDQ_TASK_DEADLINE_SOURCE,
  IdqTaskDeadlineSource,
  TaskDeadline,
} from './idq-task-deadlines';
import {
  LABEL_NAME_MAX_LENGTH,
  ParsedTaskLabels,
  TASK_FIELDS,
  TaskField,
  TaskStatus,
  TaskVocabulary,
  fieldOfLabel,
} from './idq-task-fields';
import {
  IdqTaskAssigneesService,
  TaskAssignee,
  WorkspaceMember,
} from './idq-task-assignees.service';
import { IdqTaskSettingsService } from './idq-task-settings.service';

/**
 * Emitted when a task is created or changes column through the board or the
 * task panel, for other IDQ features (e.g. #12 closes the deadlines of a
 * task moved to "done"). Status labels edited in Docmost's own labels
 * section are not reported.
 */
export const IDQ_TASK_STATUS_CHANGED = 'idq.task.status-changed';

export type IdqTaskStatusChangedEvent = {
  pageId: string;
  spaceId: string;
  workspaceId: string;
  userId: string;
  status: TaskStatus;
  /** null for a new task, or a status label outside the vocabulary. */
  previousStatus: TaskStatus | null;
};

export type BoardTask = {
  pageId: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  /** Known status, or null for a status label outside the vocabulary. */
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
  canCreate: boolean;
  tasks: BoardTask[];
};

/** A new task, and its page as the sidebar tree needs it. */
export type CreatedTask = {
  task: BoardTask;
  page: Pick<
    Page,
    'id' | 'slugId' | 'title' | 'icon' | 'position' | 'parentPageId' | 'spaceId'
  >;
};

export type TaskUsage = LinkingPage & { status: TaskStatus | null };

export type PageTaskInfo = {
  pageId: string;
  isTask: boolean;
  canEdit: boolean;
  task: Omit<BoardTask, 'linkCount'> | null;
  links: TaskLinkView[];
  usedIn: TaskUsage[];
};

export type TaskFieldsInput = {
  /** null removes the priority. */
  priority?: string | null;
  areas?: string[];
  assignees?: string[];
};

/** Values to choose from in the task panel. */
export type TaskFieldOptions = {
  priorities: string[];
  areas: string[];
  /** Person-in-charge values in use, including names without an account. */
  assignees: TaskAssignee[];
  members: WorkspaceMember[];
};

type StoredTaskPage = Pick<
  Page,
  'id' | 'slugId' | 'title' | 'icon' | 'spaceId' | 'createdAt' | 'updatedAt'
>;

function toStoredTask(
  page: StoredTaskPage,
  fields: ParsedTaskLabels,
): StoredTask {
  return {
    ...fields,
    pageId: page.id,
    slugId: page.slugId,
    title: page.title,
    icon: page.icon,
    spaceId: page.spaceId,
    createdAt: page.createdAt as Date,
    updatedAt: page.updatedAt as Date,
  };
}

/**
 * The task board: reads tasks from labels, filters them by permission and
 * adds people in charge, deadlines and linked materials.
 */
@Injectable()
export class IdqTaskBoardService implements OnModuleInit {
  private readonly logger = new Logger('IdqTaskBoardService');
  private pageController: PageController;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly moduleRef: ModuleRef,
    private readonly eventEmitter: EventEmitter2,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly access: IdqTaskAccess,
    private readonly labelStore: IdqTaskLabelStore,
    private readonly links: IdqTaskLinksService,
    private readonly assignees: IdqTaskAssigneesService,
    private readonly settings: IdqTaskSettingsService,
    @Optional()
    @Inject(IDQ_TASK_DEADLINE_SOURCE)
    private readonly deadlineSource?: IdqTaskDeadlineSource,
  ) {}

  onModuleInit() {
    // PageModule doesn't export it: same approach as the IDQ MCP.
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
    const [space, vocabulary] = await Promise.all([
      this.db
        .selectFrom('spaces')
        .select(['id', 'name', 'slug'])
        .where('id', '=', spaceId)
        .where('workspaceId', '=', workspace.id)
        .executeTakeFirstOrThrow(),
      this.settings.vocabulary(workspace.id),
    ]);

    const stored = await this.labelStore.findSpaceTasks(
      spaceId,
      workspace.id,
      vocabulary,
    );
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
    const vocabulary = await this.settings.vocabulary(workspace.id);
    const fields = await this.labelStore.findPageTask(page.id, vocabulary);
    const isTask = fields.statusValue !== null;

    const [boardTask, links, usedIn] = await Promise.all([
      isTask
        ? this.toBoardTasks(
            [toStoredTask(page, fields)],
            user,
            workspace.id,
            new Set(canEdit ? [page.id] : []),
            { withLinkCount: false },
          ).then(([first]) => first)
        : null,
      isTask ? this.links.listForTask(page.id, user, workspace.id) : [],
      this.usedIn(page.id, user, workspace.id, vocabulary),
    ]);

    let task: PageTaskInfo['task'] = null;
    if (boardTask) {
      const { linkCount: _linkCount, ...rest } = boardTask;
      task = rest;
    }
    return { pageId: page.id, isTask, canEdit, task, links, usedIn };
  }

  async setStatus(
    pageId: string,
    status: TaskStatus,
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    const { page, fields, vocabulary } = await this.findEditableTask(
      pageId,
      user,
      workspace,
    );
    if (fields.status === status) return;

    await this.labelStore.setStatus(page.id, workspace.id, vocabulary, status);
    this.emitStatusChanged(page, workspace, user, status, fields.status);
  }

  /** Replaces priority, areas and people in charge of a task. */
  async setFields(
    pageId: string,
    input: TaskFieldsInput,
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    const { page, vocabulary } = await this.findEditableTask(
      pageId,
      user,
      workspace,
    );

    const changes: Partial<Record<TaskField, string[]>> = {};
    if (input.priority !== undefined) {
      changes.priority = input.priority ? [input.priority] : [];
    }
    if (input.areas !== undefined) changes.area = input.areas;
    if (input.assignees !== undefined) changes.assignee = input.assignees;

    for (const [field, values] of Object.entries(changes)) {
      for (const value of values) {
        const name = vocabulary.prefixes[field as TaskField] + value;
        if (name.length > LABEL_NAME_MAX_LENGTH) {
          throw new BadRequestException(`"${value}" is too long`);
        }
      }
    }
    await this.labelStore.replaceFields(
      page.id,
      workspace.id,
      vocabulary,
      changes,
    );
  }

  /**
   * Creates a task page in the given column, under the page that holds the
   * other tasks of the space (an index page, for instance) or at the root.
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
  ): Promise<CreatedTask> {
    const { canEdit } = await this.access.spacePermissions(user, input.spaceId);
    if (!canEdit) throw new ForbiddenException();

    const vocabulary = await this.settings.vocabulary(workspace.id);
    const parentPageId = await this.labelStore.usualTaskParent(
      input.spaceId,
      workspace.id,
      vocabulary,
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

    await this.labelStore.setStatus(
      page.id,
      workspace.id,
      vocabulary,
      input.status,
    );
    this.emitStatusChanged(page, workspace, user, input.status, null);

    const fields = await this.labelStore.findPageTask(page.id, vocabulary);
    const [task] = await this.toBoardTasks(
      [toStoredTask(page, fields)],
      user,
      workspace.id,
      new Set([page.id]),
    );
    return {
      task,
      page: {
        id: page.id,
        slugId: page.slugId,
        title: page.title,
        icon: page.icon,
        position: page.position,
        parentPageId: page.parentPageId,
        spaceId: page.spaceId,
      },
    };
  }

  async addLink(
    taskPageId: string,
    input: AddTaskLinkInput,
    user: User,
    workspace: Workspace,
  ): Promise<TaskLinkView> {
    const { page } = await this.findEditableTask(taskPageId, user, workspace);
    return this.links.add(page, input, user, workspace.id);
  }

  async getFieldOptions(
    spaceId: string,
    user: User,
    workspace: Workspace,
  ): Promise<TaskFieldOptions> {
    await this.access.spacePermissions(user, spaceId);
    const vocabulary = await this.settings.vocabulary(workspace.id);
    const [used, resolve, members] = await Promise.all([
      this.usedValues(user, workspace.id, vocabulary),
      this.assignees.resolver(workspace.id),
      this.assignees.members(workspace.id),
    ]);
    return {
      priorities: [...new Set([...vocabulary.priorities, ...used.priority])],
      areas: used.area,
      assignees: used.assignee.map(resolve),
      members,
    };
  }

  /**
   * Values of the task labels on the pages the user can open, for pickers.
   * Stricter than Docmost's label list, which ignores page restrictions.
   */
  async usedValues(
    user: User,
    workspaceId: string,
    vocabulary: TaskVocabulary,
  ): Promise<Record<TaskField, string[]>> {
    const labels = await this.labelStore.labelsInUserSpaces(
      workspaceId,
      user.id,
      vocabulary,
    );
    const visible = await this.access.visiblePageIds(
      labels.map((l) => l.pageId),
      user.id,
      workspaceId,
    );

    const values = Object.fromEntries(
      TASK_FIELDS.map((field) => [field, new Set<string>()]),
    ) as Record<TaskField, Set<string>>;
    for (const { pageId, name } of labels) {
      const parsed = visible.has(pageId) && fieldOfLabel(name, vocabulary);
      if (parsed) values[parsed.field].add(parsed.value);
    }
    return Object.fromEntries(
      TASK_FIELDS.map((field) => [field, [...values[field]].sort()]),
    ) as Record<TaskField, string[]>;
  }

  /** Tasks that link this page as material, with their status. */
  private async usedIn(
    pageId: string,
    user: User,
    workspaceId: string,
    vocabulary: TaskVocabulary,
  ): Promise<TaskUsage[]> {
    const pages = await this.links.linkingPages(pageId, user, workspaceId);
    const fields = await this.labelStore.findPagesTasks(
      pages.map((p) => p.taskPageId),
      vocabulary,
    );
    // A page that is no longer a task doesn't count.
    return pages
      .filter((p) => fields.get(p.taskPageId).statusValue !== null)
      .map((p) => ({ ...p, status: fields.get(p.taskPageId).status }));
  }

  private async findEditableTask(
    pageId: string,
    user: User,
    workspace: Workspace,
  ): Promise<{
    page: Page;
    fields: ParsedTaskLabels;
    vocabulary: TaskVocabulary;
  }> {
    const page = await this.access.findEditablePage(pageId, user, workspace.id);
    const vocabulary = await this.settings.vocabulary(workspace.id);
    const fields = await this.labelStore.findPageTask(page.id, vocabulary);
    if (fields.statusValue === null) {
      throw new BadRequestException('The page is not a task');
    }
    return { page, fields, vocabulary };
  }

  private emitStatusChanged(
    page: Pick<Page, 'id' | 'spaceId'>,
    workspace: Workspace,
    user: User,
    status: TaskStatus,
    previousStatus: TaskStatus | null,
  ) {
    const event: IdqTaskStatusChangedEvent = {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: workspace.id,
      userId: user.id,
      status,
      previousStatus,
    };
    this.eventEmitter.emit(IDQ_TASK_STATUS_CHANGED, event);
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
      this.nextDeadlines(pageIds),
      opts.withLinkCount === false
        ? new Map<string, number>()
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

  /** Deadlines are optional: a failing source never breaks the board. */
  private async nextDeadlines(
    pageIds: string[],
  ): Promise<Map<string, TaskDeadline>> {
    if (!this.deadlineSource || pageIds.length === 0) return new Map();
    try {
      return await this.deadlineSource.nextOpenDeadlines(pageIds);
    } catch (err) {
      this.logger.warn(`Deadlines unavailable: ${err}`);
      return new Map();
    }
  }
}
