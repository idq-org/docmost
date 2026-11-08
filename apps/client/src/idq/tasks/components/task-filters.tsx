import { useMemo } from "react";
import { Button, Chip, Group, Select } from "@mantine/core";
import { IconFilterOff } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IBoardTask } from "../types";
import { labelValueText, priorityRank } from "../task-display";
import { useTaskSettings } from "../hooks/use-task-settings";

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

type TaskFiltersBarProps = {
  tasks: IBoardTask[];
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
};

export function TaskFiltersBar({
  tasks,
  filters,
  onChange,
}: TaskFiltersBarProps) {
  const { t } = useTranslation();
  const { priorities: vocabularyPriorities } = useTaskSettings();

  const options = useMemo(() => {
    const priorities = new Set<string>();
    const areas = new Set<string>();
    const assignees = new Map<string, string>();
    for (const task of tasks) {
      if (task.priority) priorities.add(task.priority);
      task.areas.forEach((area) => areas.add(area));
      task.assignees.forEach((a) => assignees.set(a.value, a.name));
    }
    return {
      priorities: [...priorities]
        .sort(
          (a, b) =>
            priorityRank(a, vocabularyPriorities) -
              priorityRank(b, vocabularyPriorities) || a.localeCompare(b),
        )
        .map((value) => ({ value, label: labelValueText(value) })),
      areas: [...areas]
        .sort()
        .map((value) => ({ value, label: labelValueText(value) })),
      assignees: [...assignees]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [tasks, vocabularyPriorities]);

  return (
    <Group gap="sm" wrap="wrap">
      <Select
        size="xs"
        w={160}
        placeholder={t("Priority")}
        aria-label={t("Priority")}
        data={options.priorities}
        value={filters.priority}
        onChange={(priority) => onChange({ ...filters, priority })}
        clearable
      />
      <Select
        size="xs"
        w={180}
        placeholder={t("Area")}
        aria-label={t("Area")}
        data={options.areas}
        value={filters.area}
        onChange={(area) => onChange({ ...filters, area })}
        clearable
        searchable
      />
      <Select
        size="xs"
        w={200}
        placeholder={t("Person in charge")}
        aria-label={t("Person in charge")}
        data={options.assignees}
        value={filters.assignee}
        onChange={(assignee) => onChange({ ...filters, assignee })}
        clearable
        searchable
      />
      <Chip
        size="sm"
        checked={filters.mine}
        onChange={(mine) => onChange({ ...filters, mine })}
      >
        {t("My tasks")}
      </Chip>
      {hasFilters(filters) && (
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          leftSection={<IconFilterOff size={14} />}
          onClick={() => onChange(NO_FILTERS)}
        >
          {t("Clear filters")}
        </Button>
      )}
    </Group>
  );
}
