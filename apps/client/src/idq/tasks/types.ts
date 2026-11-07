export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "to_decide",
  "waiting",
  "blocked",
  "to_review",
  "done",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface ITaskAssignee {
  /** Value of the `ref-` label, e.g. "mario-rossi". */
  value: string;
  name: string;
  user: { id: string; name: string | null; avatarUrl: string | null } | null;
}

export interface ITaskDeadline {
  dueAt: string;
  allDay: boolean;
  title: string | null;
}

export interface IBoardTask {
  pageId: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  /** null for a `stato-` label that the board doesn't know. */
  status: TaskStatus | null;
  statusValue: string;
  priority: string | null;
  areas: string[];
  assignees: ITaskAssignee[];
  nextDeadline: ITaskDeadline | null;
  linkCount: number;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ITaskBoard {
  space: { id: string; name: string; slug: string };
  statuses: TaskStatus[];
  canCreate: boolean;
  tasks: IBoardTask[];
}

export type TaskLinkType = "page" | "attachment" | "url";

export interface ITaskLink {
  id: string;
  type: TaskLinkType;
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
  createdAt: string;
}

export interface ITaskUsage {
  taskPageId: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  spaceSlug: string | null;
  spaceName: string | null;
  status: TaskStatus | null;
}

export interface IPageTaskInfo {
  pageId: string;
  isTask: boolean;
  canEdit: boolean;
  task: Omit<IBoardTask, "linkCount"> | null;
  links: ITaskLink[];
  usedIn: ITaskUsage[];
}

export interface IAddTaskLink {
  taskPageId: string;
  type: TaskLinkType;
  targetPageId?: string;
  attachmentId?: string;
  url?: string;
  title?: string;
}

export interface ITaskMember {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  /** `ref-` value that stands for this member. */
  value: string;
}

export interface ITaskFieldOptions {
  priorities: string[];
  areas: string[];
  assignees: ITaskAssignee[];
  members: ITaskMember[];
}

export interface ITaskFieldsInput {
  pageId: string;
  priority?: string | null;
  areas?: string[];
  assignees?: string[];
}

type AssigneeUser = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
};

export interface IAssigneeMapping {
  value: string;
  /** Member chosen by an admin. */
  user: AssigneeUser | null;
  /** Member found by name or email, used when no one is chosen. */
  automatic: AssigneeUser | null;
}
