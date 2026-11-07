/**
 * Task fields stored as page labels (issue #3, first version):
 *
 *   stato-<status>     column of the board (one per task)
 *   priorita-<value>   priority
 *   area-<value>       area
 *   ref-<name>         person in charge (any number)
 *
 * A page is a task when it has a `stato-` label. These are the labels that
 * the association already uses on the task pages, so existing tasks show up
 * on the board as they are.
 *
 * Everything that knows about the label format lives in this file and in
 * IdqTaskLabelStore, so the fields can later move to a table of their own
 * without touching the board.
 */

export const STATUS_PREFIX = 'stato-';
export const PRIORITY_PREFIX = 'priorita-';
export const AREA_PREFIX = 'area-';
export const ASSIGNEE_PREFIX = 'ref-';

export const TASK_LABEL_PREFIXES = [
  STATUS_PREFIX,
  PRIORITY_PREFIX,
  AREA_PREFIX,
  ASSIGNEE_PREFIX,
] as const;

export type TaskLabelPrefix = (typeof TASK_LABEL_PREFIXES)[number];

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'to_decide',
  'waiting',
  'blocked',
  'to_review',
  'done',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Label of each status, in board order. The first name is the one the board
 * writes; the others are accepted when reading (masculine and feminine forms).
 */
const STATUS_LABELS: Record<TaskStatus, string[]> = {
  todo: ['stato-da-fare'],
  in_progress: ['stato-in-corso'],
  to_decide: ['stato-da-decidere'],
  waiting: ['stato-in-attesa'],
  blocked: ['stato-bloccata', 'stato-bloccato'],
  to_review: ['stato-da-verificare'],
  done: ['stato-fatto', 'stato-fatta'],
};

const STATUS_BY_LABEL = new Map<string, TaskStatus>(
  TASK_STATUSES.flatMap((status) =>
    STATUS_LABELS[status].map((label) => [label, status] as const),
  ),
);

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value as string);
}

export function statusLabelName(status: TaskStatus): string {
  return STATUS_LABELS[status][0];
}

export function isTaskLabel(name: string): boolean {
  return TASK_LABEL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * A value that can follow a prefix in a label name: Docmost's label rules
 * (lowercase letters, digits, `-`, `_`, `~`, not starting with `~`), with
 * room for the longest prefix within Docmost's 100 characters.
 */
export const LABEL_VALUE_PATTERN = /^[a-z0-9_-][a-z0-9_~-]*$/;
export const LABEL_VALUE_MAX_LENGTH = 100 - PRIORITY_PREFIX.length;

export function isLabelValue(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= LABEL_VALUE_MAX_LENGTH &&
    LABEL_VALUE_PATTERN.test(value)
  );
}

export type ParsedTaskLabels = {
  /** Known status, or null when the `stato-` label isn't one of ours. */
  status: TaskStatus | null;
  /** Raw value of the status label (e.g. "da-fare"), null if not a task. */
  statusValue: string | null;
  priority: string | null;
  areas: string[];
  assignees: string[];
};

function stripPrefix(name: string, prefix: string): string | null {
  if (!name.startsWith(prefix)) return null;
  const value = name.slice(prefix.length);
  return value.length > 0 ? value : null;
}

/**
 * Reads the task fields from the names of a page's labels. With more than one
 * status label, the known status that comes first on the board wins; with
 * more than one priority, the first in alphabetical order.
 */
export function parseTaskLabels(names: string[]): ParsedTaskLabels {
  const sorted = [...new Set(names)].sort();
  const result: ParsedTaskLabels = {
    status: null,
    statusValue: null,
    priority: null,
    areas: [],
    assignees: [],
  };

  let statusRank = Infinity;
  for (const name of sorted) {
    const status = stripPrefix(name, STATUS_PREFIX);
    if (status) {
      const known = STATUS_BY_LABEL.get(name) ?? null;
      const rank = known ? TASK_STATUSES.indexOf(known) : TASK_STATUSES.length;
      if (rank < statusRank) {
        statusRank = rank;
        result.status = known;
        result.statusValue = status;
      }
      continue;
    }

    const priority = stripPrefix(name, PRIORITY_PREFIX);
    if (priority) {
      result.priority ??= priority;
      continue;
    }

    const area = stripPrefix(name, AREA_PREFIX);
    if (area) {
      result.areas.push(area);
      continue;
    }

    const assignee = stripPrefix(name, ASSIGNEE_PREFIX);
    if (assignee) {
      result.assignees.push(assignee);
    }
  }

  return result;
}

/**
 * Slug used to match a `ref-` label with a workspace member, in the same
 * format as label names: lowercase, no accents, words joined by hyphens.
 */
export function toLabelSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_~]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type AssigneeCandidate = {
  id: string;
  name: string | null;
  email: string;
};

/**
 * Index from `ref-` value to user. A user matches their full name
 * ("mario-rossi"), their first name ("mario") and the part of their email
 * before the @. A value shared by more than one user is ambiguous and matches
 * nobody, except for full names, which win over first names.
 */
export function buildAssigneeIndex<T extends AssigneeCandidate>(
  users: T[],
): Map<string, T> {
  const strong = new Map<string, T[]>();
  const weak = new Map<string, T[]>();
  const add = (map: Map<string, T[]>, key: string, user: T) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.includes(user)) list.push(user);
    map.set(key, list);
  };

  for (const user of users) {
    const fullName = toLabelSlug(user.name ?? '');
    add(strong, fullName, user);
    add(weak, fullName.split('-')[0], user);
    add(weak, toLabelSlug(user.email.split('@')[0]), user);
  }

  const index = new Map<string, T>();
  for (const [key, list] of weak) {
    if (list.length === 1) index.set(key, list[0]);
  }
  for (const [key, list] of strong) {
    if (list.length === 1) index.set(key, list[0]);
    else index.delete(key);
  }
  return index;
}

/** "mario-rossi" → "Mario Rossi", for values without a matching user. */
export function humanizeLabelValue(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
