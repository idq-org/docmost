/**
 * Columns of the board. They are keys, not label text: the server sends the
 * list in order (ITaskSettings.statuses), and the client only names them.
 */
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "to_decide"
  | "waiting"
  | "blocked"
  | "to_review"
  | "done";

export type TaskField = "status" | "priority" | "area" | "assignee";

/** Label prefixes and values of the workspace (server: TaskVocabulary). */
export interface ITaskVocabulary {
  prefixes: Record<TaskField, string>;
  /** First value: written when a card moves; the others are also read. */
  statuses: Record<TaskStatus, string[]>;
  /** Most urgent first. */
  priorities: string[];
}

export interface ITaskSettings {
  vocabulary: ITaskVocabulary;
  statuses: TaskStatus[];
  isDefault: boolean;
}

export interface IAssigneeUser {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface ITaskAssignee {
  /** Value of the person-in-charge label, e.g. "mario-rossi". */
  value: string;
  name: string;
  user: IAssigneeUser | null;
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
  /** null for a status label outside the vocabulary. */
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
  canCreate: boolean;
  tasks: IBoardTask[];
}

/** A new task, and its page as the sidebar tree needs it. */
export interface ICreatedTask {
  task: IBoardTask;
  page: {
    id: string;
    slugId: string;
    title: string | null;
    icon: string | null;
    position: string;
    parentPageId: string | null;
    spaceId: string;
  };
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

export interface ITaskMember extends IAssigneeUser {
  /** Label value that stands for this member. Unique. */
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
  /** Label values, or names typed by the user: the server slugs them. */
  assignees?: string[];
}

export interface IAssigneeMapping {
  value: string;
  /** Member chosen by an admin. */
  user: IAssigneeUser | null;
  /** Member found by name or email, used when no one is chosen. */
  automatic: IAssigneeUser | null;
}
