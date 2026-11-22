import { IBoardTask } from "./types";

/** Filters of the board, applied in the browser. */
export type TaskFilters = {
  priority: string | null;
  area: string | null;
  assignee: string | null;
  mine: boolean;
};

export const NO_FILTERS: TaskFilters = {
  priority: null,
  area: null,
  assignee: null,
  mine: false,
};

export function hasFilters(filters: TaskFilters) {
  return Boolean(
    filters.priority || filters.area || filters.assignee || filters.mine,
  );
}

export function applyFilters(
  tasks: IBoardTask[],
  filters: TaskFilters,
  currentUserId: string | undefined,
): IBoardTask[] {
  return tasks.filter(
    (task) =>
      (!filters.priority || task.priority === filters.priority) &&
      (!filters.area || task.areas.includes(filters.area)) &&
      (!filters.assignee ||
        task.assignees.some((a) => a.value === filters.assignee)) &&
      (!filters.mine ||
        task.assignees.some((a) => a.user && a.user.id === currentUserId)),
  );
}
