import { useCallback, useMemo, useState } from "react";
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
import { useTaskSettings } from "../hooks/use-task-settings";
import { IPageTaskInfo, ITaskFieldOptions } from "../types";
import { labelValueText, priorityRank } from "../task-display";

type TaskFieldsModalProps = {
  info: IPageTaskInfo;
  spaceId: string;
  opened: boolean;
  onClose: () => void;
};

/** Priority, areas and people in charge of a task: labels, edited here. */
export function TaskFieldsModal({
  info,
  spaceId,
  opened,
  onClose,
}: TaskFieldsModalProps) {
  const { t } = useTranslation();
  const { data: options, isLoading } = useTaskFieldOptionsQuery(
    spaceId,
    opened,
  );

  return (
    <Modal opened={opened} onClose={onClose} title={t("Edit task")}>
      {isLoading || !options ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : (
        info.task && (
          // Mounted when opened: the form starts from the current values.
          <TaskFieldsForm info={info} options={options} onDone={onClose} />
        )
      )}
    </Modal>
  );
}

type Option = { value: string; label: string };

function TaskFieldsForm({
  info,
  options,
  onDone,
}: {
  info: IPageTaskInfo;
  options: ITaskFieldOptions;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const task = info.task;
  const { priorities } = useTaskSettings();
  const save = useSetTaskFieldsMutation();

  // Each member has one value (the server guarantees it): a person in
  // charge matched to a member is shown, and saved, as that member.
  const memberValueById = useMemo(
    () => new Map(options.members.map((m) => [m.id, m.value])),
    [options.members],
  );
  const asMemberValue = useCallback(
    (a: { value: string; user: { id: string } | null }) =>
      (a.user && memberValueById.get(a.user.id)) ?? a.value,
    [memberValueById],
  );

  const [priority, setPriority] = useState<string | null>(task.priority);
  const [areas, setAreas] = useState<string[]>(task.areas.map(labelValueText));
  const [assignees, setAssignees] = useState<string[]>(() => [
    ...new Set(task.assignees.map(asMemberValue)),
  ]);
  const [typedNames, setTypedNames] = useState<Option[]>([]);
  const [typedName, setTypedName] = useState("");

  const priorityData = useMemo<Option[]>(() => {
    const values = new Set([
      ...options.priorities,
      ...(task.priority ? [task.priority] : []),
    ]);
    return [...values]
      .sort(
        (a, b) =>
          priorityRank(a, priorities) - priorityRank(b, priorities) ||
          a.localeCompare(b),
      )
      .map((value) => ({ value, label: labelValueText(value) }));
  }, [options.priorities, task.priority, priorities]);

  // Areas are shown as text ("Teacher training") and saved as label values;
  // existing values keep their exact spelling.
  const areaValueByText = useMemo(() => {
    const map = new Map<string, string>();
    for (const value of [...options.areas, ...task.areas]) {
      map.set(labelValueText(value), value);
    }
    return map;
  }, [options.areas, task.areas]);

  const assigneeData = useMemo(() => {
    const members: Option[] = options.members.map((m) => ({
      value: m.value,
      label: m.name || labelValueText(m.value),
    }));
    const taken = new Set(members.map((m) => m.value));
    const others: Option[] = [];
    for (const a of [...options.assignees, ...task.assignees]) {
      const value = asMemberValue(a);
      if (taken.has(value)) continue;
      taken.add(value);
      others.push({ value, label: a.name });
    }
    for (const typed of typedNames) {
      if (taken.has(typed.value)) continue;
      taken.add(typed.value);
      others.push(typed);
    }
    return [
      { group: t("Members"), items: members },
      { group: t("Without an account"), items: others },
    ].filter((group) => group.items.length > 0);
  }, [
    options.members,
    options.assignees,
    task.assignees,
    typedNames,
    asMemberValue,
    t,
  ]);

  const addTypedName = () => {
    const name = typedName.trim();
    if (!name) return;
    // The server turns the name into a label value.
    setTypedNames((list) => [...list, { value: name, label: name }]);
    setAssignees((list) => (list.includes(name) ? list : [...list, name]));
    setTypedName("");
  };

  const submit = () =>
    save.mutate(
      {
        pageId: info.pageId,
        priority,
        areas: areas.map((text) => areaValueByText.get(text) ?? text),
        assignees,
      },
      { onSuccess: onDone },
    );

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
          value={typedName}
          onChange={(e) => setTypedName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTypedName();
            }
          }}
        />
        <Tooltip label={t("Add to the people in charge")} withArrow>
          <ActionIcon
            size={36}
            variant="default"
            aria-label={t("Add to the people in charge")}
            onClick={addTypedName}
            disabled={!typedName.trim()}
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
