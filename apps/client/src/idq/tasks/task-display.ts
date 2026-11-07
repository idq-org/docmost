import type { MantineColor } from "@mantine/core";
import type { TFunction } from "i18next";
import { IBoardTask, ITaskDeadline, TaskStatus } from "./types";

/** English names of the columns; translations live in i18n.ts. */
const STATUS_NAMES: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  to_decide: "To decide",
  waiting: "Waiting",
  blocked: "Blocked",
  to_review: "To review",
  done: "Done",
};

const STATUS_COLORS: Record<TaskStatus, MantineColor> = {
  todo: "gray",
  in_progress: "blue",
  to_decide: "violet",
  waiting: "yellow",
  blocked: "red",
  to_review: "cyan",
  done: "green",
};

export function statusName(status: TaskStatus, t: TFunction): string {
  return t(STATUS_NAMES[status]);
}

export function statusColor(status: TaskStatus | null): MantineColor {
  return status ? STATUS_COLORS[status] : "gray";
}

/** Colors of the priorities, most urgent first; the rest are gray. */
const PRIORITY_COLORS: MantineColor[] = ["red", "orange", "yellow"];

/**
 * Position of a priority in the workspace vocabulary (most urgent first).
 * Values outside it come after, and no priority comes last.
 */
export function priorityRank(
  priority: string | null,
  priorities: string[],
): number {
  if (!priority) return priorities.length + 1;
  const index = priorities.indexOf(priority);
  return index === -1 ? priorities.length : index;
}

export function priorityColor(
  priority: string | null,
  priorities: string[],
): MantineColor {
  const index = priority ? priorities.indexOf(priority) : -1;
  return PRIORITY_COLORS[index] ?? "gray";
}

/** "teacher-training" → "Teacher training": label values as text. */
export function labelValueText(value: string): string {
  const text = value.replace(/[-_~]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** End of the deadline: the end of the day for all-day deadlines. */
function deadlineEnd(deadline: ITaskDeadline): Date {
  const due = new Date(deadline.dueAt);
  if (deadline.allDay) {
    due.setHours(23, 59, 59, 999);
  }
  return due;
}

export function isOverdue(deadline: ITaskDeadline | null, now = new Date()) {
  return Boolean(deadline) && deadlineEnd(deadline).getTime() < now.getTime();
}

export function formatDeadline(
  deadline: ITaskDeadline,
  language: string,
): string {
  const due = new Date(deadline.dueAt);
  const sameYear = due.getFullYear() === new Date().getFullYear();
  return due.toLocaleString(language, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    ...(deadline.allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
  });
}

/** Order inside a column: priority, then deadline, then title. */
export function compareTasks(priorities: string[]) {
  return (a: IBoardTask, b: IBoardTask): number => {
    const byPriority =
      priorityRank(a.priority, priorities) -
      priorityRank(b.priority, priorities);
    if (byPriority !== 0) return byPriority;

    const aDue = a.nextDeadline
      ? new Date(a.nextDeadline.dueAt).getTime()
      : null;
    const bDue = b.nextDeadline
      ? new Date(b.nextDeadline.dueAt).getTime()
      : null;
    if (aDue !== bDue) {
      if (aDue === null) return 1;
      if (bDue === null) return -1;
      return aDue - bDue;
    }

    return (a.title ?? "").localeCompare(b.title ?? "");
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function taskBoardUrl(spaceSlug: string): string {
  return `/s/${spaceSlug}/board`;
}

/**
 * Markdown of a new task page: a table for what labels can't hold, then
 * goal, steps (a checklist) and references, in the writer's language.
 * Status, priority, area and people in charge are labels, shown in the
 * panel under the title.
 */
export function newTaskContent(t: TFunction): string {
  return [
    `| ${t("Field")} | ${t("Value")} |`,
    "| --- | --- |",
    `| **${t("Deadline")}** | — |`,
    `| **${t("Depends on")}** | — |`,
    "",
    `## ${t("Goal")}`,
    "",
    `## ${t("Steps")}`,
    "",
    // An empty checklist item would become plain text.
    `- [ ] ${t("First step")}`,
    "",
    `## ${t("References")}`,
    "",
  ].join("\n");
}
