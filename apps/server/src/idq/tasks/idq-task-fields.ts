/**
 * Task fields stored as page labels (issue #3, first version). A page is a
 * task when it has a status label; priority, areas and people in charge are
 * labels too, so the labels keep working in Docmost's own label pages.
 *
 * The words are not fixed: each workspace sets the prefixes and values it
 * uses (TaskVocabulary), with English defaults. Everything that knows about
 * the label format lives in this file and in IdqTaskLabelStore, so the
 * fields can later move to a table of their own without touching the board.
 */

/** Columns of the board, in order. They are keys, not label text. */
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

export const TASK_FIELDS = ['status', 'priority', 'area', 'assignee'] as const;

export type TaskField = (typeof TASK_FIELDS)[number];

export type TaskVocabulary = {
  /** Label prefix of each field, e.g. `status-`. */
  prefixes: Record<TaskField, string>;
  /**
   * Label values of each status, after the prefix. The first one is written
   * when a card moves; the others are also read (e.g. synonyms).
   */
  statuses: Record<TaskStatus, string[]>;
  /** Priority values, most urgent first: the board orders and colors by it. */
  priorities: string[];
};

export const DEFAULT_TASK_VOCABULARY: TaskVocabulary = {
  prefixes: {
    status: 'status-',
    priority: 'priority-',
    area: 'area-',
    assignee: 'assignee-',
  },
  statuses: {
    todo: ['todo'],
    in_progress: ['in-progress'],
    to_decide: ['to-decide'],
    waiting: ['waiting'],
    blocked: ['blocked'],
    to_review: ['to-review'],
    done: ['done'],
  },
  priorities: ['highest', 'high', 'medium', 'low'],
};

/**
 * Docmost's label name rules (label.dto.ts): lowercase letters, digits,
 * `-`, `_`, `~`, not starting with `~`, at most 100 characters. A prefix and
 * a value together stay within that limit.
 */
export const LABEL_NAME_PATTERN = /^[a-z0-9_-][a-z0-9_~-]*$/;
export const LABEL_NAME_MAX_LENGTH = 100;
export const PREFIX_MAX_LENGTH = 30;
export const LABEL_VALUE_MAX_LENGTH = LABEL_NAME_MAX_LENGTH - PREFIX_MAX_LENGTH;
const MAX_VALUES_PER_STATUS = 10;
const MAX_PRIORITIES = 10;

export function isLabelValue(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= LABEL_VALUE_MAX_LENGTH &&
    LABEL_NAME_PATTERN.test(value)
  );
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value as string);
}

export class InvalidVocabularyError extends Error {}

/**
 * Checks a vocabulary sent by an admin and returns it normalized, or throws
 * InvalidVocabularyError with a message for the admin.
 */
export function validateVocabulary(input: unknown): TaskVocabulary {
  const fail = (message: string): never => {
    throw new InvalidVocabularyError(message);
  };
  const obj = (input ?? {}) as Partial<Record<keyof TaskVocabulary, unknown>>;
  const prefixesIn = (obj.prefixes ?? {}) as Record<string, unknown>;
  const statusesIn = (obj.statuses ?? {}) as Record<string, unknown>;

  const prefixes = {} as Record<TaskField, string>;
  for (const field of TASK_FIELDS) {
    const prefix = String(prefixesIn[field] ?? '')
      .trim()
      .toLowerCase();
    if (
      !prefix ||
      prefix.length > PREFIX_MAX_LENGTH ||
      !LABEL_NAME_PATTERN.test(prefix)
    ) {
      fail(
        `The ${field} prefix must be 1 to ${PREFIX_MAX_LENGTH} lowercase letters, digits, "-", "_" or "~"`,
      );
    }
    prefixes[field] = prefix;
  }
  // A label must belong to one field only.
  for (const a of TASK_FIELDS) {
    for (const b of TASK_FIELDS) {
      if (a !== b && prefixes[b].startsWith(prefixes[a])) {
        fail(`The ${b} prefix starts with the ${a} prefix`);
      }
    }
  }

  const values = (list: unknown, what: string, max: number): string[] => {
    if (!Array.isArray(list)) fail(`${what}: a list of values is required`);
    const clean = [
      ...new Set(
        (list as unknown[]).map((v) => String(v).trim().toLowerCase()),
      ),
    ];
    if (clean.length > max) fail(`${what}: at most ${max} values`);
    for (const value of clean) {
      if (!isLabelValue(value))
        fail(`${what}: "${value}" is not a valid value`);
    }
    return clean;
  };

  const statuses = {} as Record<TaskStatus, string[]>;
  const seen = new Map<string, TaskStatus>();
  for (const status of TASK_STATUSES) {
    statuses[status] = values(
      statusesIn[status],
      `Status ${status}`,
      MAX_VALUES_PER_STATUS,
    );
    if (statuses[status].length === 0) {
      fail(`Status ${status}: at least one value is required`);
    }
    for (const value of statuses[status]) {
      if (seen.has(value)) {
        fail(`"${value}" is used by both ${seen.get(value)} and ${status}`);
      }
      seen.set(value, status);
    }
  }

  return {
    prefixes,
    statuses,
    priorities: values(obj.priorities, 'Priorities', MAX_PRIORITIES),
  };
}

/** Label name written for a status, e.g. `status-in-progress`. */
export function statusLabelName(
  status: TaskStatus,
  vocabulary: TaskVocabulary,
): string {
  return vocabulary.prefixes.status + vocabulary.statuses[status][0];
}

export type ParsedTaskLabels = {
  /** Known status, or null when the status label isn't in the vocabulary. */
  status: TaskStatus | null;
  /** Value of the status label (e.g. "in-progress"), null if not a task. */
  statusValue: string | null;
  priority: string | null;
  areas: string[];
  assignees: string[];
};

/** The field a label belongs to, and its value, or null. */
export function fieldOfLabel(
  name: string,
  vocabulary: TaskVocabulary,
): { field: TaskField; value: string } | null {
  for (const field of TASK_FIELDS) {
    const prefix = vocabulary.prefixes[field];
    if (name.startsWith(prefix) && name.length > prefix.length) {
      return { field, value: name.slice(prefix.length) };
    }
  }
  return null;
}

/**
 * Reads the task fields from the names of a page's labels. With more than
 * one status label, the known status that comes first on the board wins;
 * with more than one priority, the most urgent known one, then the first in
 * alphabetical order.
 */
export function parseTaskLabels(
  names: string[],
  vocabulary: TaskVocabulary,
): ParsedTaskLabels {
  const result: ParsedTaskLabels = {
    status: null,
    statusValue: null,
    priority: null,
    areas: [],
    assignees: [],
  };
  const statusByValue = new Map<string, TaskStatus>(
    TASK_STATUSES.flatMap((status) =>
      vocabulary.statuses[status].map((value) => [value, status] as const),
    ),
  );
  const rank = (index: number, length: number) =>
    index === -1 ? length : index;

  let statusRank = Infinity;
  let priorityRank = Infinity;
  for (const name of [...new Set(names)].sort()) {
    const parsed = fieldOfLabel(name, vocabulary);
    if (!parsed) continue;
    const { field, value } = parsed;

    if (field === 'status') {
      const known = statusByValue.get(value) ?? null;
      const r = rank(
        known ? TASK_STATUSES.indexOf(known) : -1,
        TASK_STATUSES.length,
      );
      if (r < statusRank) {
        statusRank = r;
        result.status = known;
        result.statusValue = value;
      }
    } else if (field === 'priority') {
      const r = rank(
        vocabulary.priorities.indexOf(value),
        vocabulary.priorities.length,
      );
      if (r < priorityRank) {
        priorityRank = r;
        result.priority = value;
      }
    } else if (field === 'area') {
      result.areas.push(value);
    } else {
      result.assignees.push(value);
    }
  }
  return result;
}

/** Escapes `%`, `_` and `\` for a SQL LIKE pattern. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

/**
 * Slug used to match a person-in-charge label with a workspace member, in
 * the same format as label names: lowercase, no accents, words joined by
 * hyphens.
 */
export function toLabelSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_~]+/g, '-')
    .replace(/^[-~]+|-+$/g, '');
}

export type AssigneeCandidate = {
  id: string;
  name: string | null;
  email: string;
};

/**
 * Index from person-in-charge value to user. A user matches their full name
 * ("mario-rossi"), their first name ("mario") and the part of their email
 * before the @. A value shared by more than one user is ambiguous and
 * matches nobody, except for full names, which win over first names.
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

/**
 * Name shown for a person-in-charge value without a matching member:
 * "mario-rossi" → "Mario Rossi".
 */
export function nameFromLabelValue(value: string): string {
  return value
    .split(/[-_~]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
