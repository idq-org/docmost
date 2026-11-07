import { useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Select,
  Stack,
  TagsInput,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useSetTaskFieldsMutation,
  useTaskFieldOptionsQuery,
} from "../queries/idq-task-query";
import { IPageTaskInfo, ITaskAssignee } from "../types";
import {
  PRIORITIES,
  labelValueText,
  priorityRank,
  toLabelSlug,
} from "../task-display";

type TaskFieldsModalProps = {
  info: IPageTaskInfo;
  spaceId: string;
  opened: boolean;
  onClose: () => void;
};

/**
 * Priority, areas and people in charge of a task. They are labels
 * (priorita-, area-, ref-): this form replaces the table rows that used to
 * hold them in the task pages.
 */
export function TaskFieldsModal({
  info,
  spaceId,
  opened,
  onClose,
}: TaskFieldsModalProps) {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onClose} title={t("Edit task")}>
      {opened && info.task && (
        <TaskFieldsForm info={info} spaceId={spaceId} onDone={onClose} />
      )}
    </Modal>
  );
}

function TaskFieldsForm({
  info,
  spaceId,
  onDone,
}: {
  info: IPageTaskInfo;
  spaceId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const task = info.task;
  const { data: options, isLoading } = useTaskFieldOptionsQuery(spaceId, true);
  const save = useSetTaskFieldsMutation();

  const [priority, setPriority] = useState<string | null>(task.priority);
  const [areas, setAreas] = useState<string[]>(task.areas.map(labelValueText));
  const [assignees, setAssignees] = useState<string[]>(
    task.assignees.map((a) => a.value),
  );
  const [extraNames, setExtraNames] = useState<ITaskAssignee[]>([]);
  const [freeName, setFreeName] = useState("");

  const priorityData = useMemo(() => {
    const values = new Set([
      ...PRIORITIES.map((p) => p.value),
      ...(options?.priorities ?? []),
      ...(task.priority ? [task.priority] : []),
    ]);
    return [...values]
      .sort((a, b) => priorityRank(a) - priorityRank(b) || a.localeCompare(b))
      .map((value) => ({ value, label: labelValueText(value) }));
  }, [options?.priorities, task.priority]);

  // Area labels are shown as text ("Offerta formativa") and saved as label
  // values; existing values keep their exact spelling.
  const areaValueByText = useMemo(() => {
    const map = new Map<string, string>();
    for (const value of [...(options?.areas ?? []), ...task.areas]) {
      map.set(labelValueText(value), value);
    }
    return map;
  }, [options?.areas, task.areas]);

  const assigneeData = useMemo(() => {
    const members = (options?.members ?? []).map((m) => ({
      value: m.value,
      label: m.name || labelValueText(m.value),
    }));
    const memberValues = new Set(members.map((m) => m.value));
    const others = new Map<string, string>();
    for (const a of [
      ...(options?.assignees ?? []),
      ...task.assignees,
      ...extraNames,
    ]) {
      if (!memberValues.has(a.value) && !others.has(a.value)) {
        others.set(a.value, a.user?.name || a.name);
      }
    }
    return [
      { group: t("Members"), items: members },
      {
        group: t("Without an account"),
        items: [...others].map(([value, label]) => ({ value, label })),
      },
    ].filter((g) => g.items.length > 0);
  }, [options?.members, options?.assignees, task.assignees, extraNames, t]);

  const addFreeName = () => {
    const name = freeName.trim();
    const value = toLabelSlug(name);
    if (!value) return;
    setExtraNames((list) => [...list, { value, name, user: null }]);
    setAssignees((list) => (list.includes(value) ? list : [...list, value]));
    setFreeName("");
  };

  const submit = () => {
    save.mutate(
      {
        pageId: info.pageId,
        priority,
        areas: areas.map((text) => areaValueByText.get(text) ?? text),
        assignees,
      },
      { onSuccess: onDone },
    );
  };

  if (isLoading) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    );
  }

  return (
    <Stack gap="md">
      <Select
        label={t("Priority")}
        data={priorityData}
        value={priority}
        onChange={(value) => setPriority(value === null ? null : String(value))}
        clearable
        placeholder={t("No priority")}
      />

      <TagsInput
        label={t("Area")}
        description={t("Choose one or type a new one")}
        data={[...areaValueByText.keys()]}
        value={areas}
        onChange={setAreas}
        clearable
      />

      <MultiSelect
        label={t("People in charge")}
        data={assigneeData}
        value={assignees}
        onChange={setAssignees}
        searchable
        clearable
        placeholder={assignees.length === 0 ? t("To be assigned") : undefined}
        nothingFoundMessage={t("No one found")}
      />

      <Group gap="xs" align="flex-end" wrap="nowrap">
        <TextInput
          style={{ flex: 1 }}
          label={t("Someone without an account")}
          placeholder={t("Name and surname")}
          value={freeName}
          onChange={(e) => setFreeName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFreeName();
            }
          }}
        />
        <Tooltip label={t("Add to the people in charge")} withArrow>
          <ActionIcon
            size={36}
            variant="default"
            aria-label={t("Add to the people in charge")}
            onClick={addFreeName}
            disabled={!toLabelSlug(freeName)}
          >
            <IconPlus size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button onClick={submit} loading={save.isPending}>
          {t("Save")}
        </Button>
      </Group>
    </Stack>
  );
}
