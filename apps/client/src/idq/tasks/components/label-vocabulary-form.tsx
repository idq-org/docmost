import { useState } from "react";
import {
  Alert,
  Button,
  Code,
  Group,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useUpdateTaskSettingsMutation } from "../queries/idq-task-query";
import { statusName } from "../task-display";
import { ITaskVocabulary, TaskField, TaskStatus } from "../types";
import { StatusDot } from "./status-menu-items";

const FIELDS: Array<{ field: TaskField; name: string }> = [
  { field: "status", name: "Status" },
  { field: "priority", name: "Priority" },
  { field: "area", name: "Area" },
  { field: "assignee", name: "Person in charge" },
];

type LabelVocabularyFormProps = {
  vocabulary: ITaskVocabulary;
  statuses: TaskStatus[];
  onSaved?: () => void;
};

/**
 * The words of the task labels: a prefix per field, the values of each
 * column and the priorities. Workspace admins only (the server checks).
 */
export function LabelVocabularyForm({
  vocabulary,
  statuses,
  onSaved,
}: LabelVocabularyFormProps) {
  const { t } = useTranslation();
  const save = useUpdateTaskSettingsMutation();
  const [draft, setDraft] = useState<ITaskVocabulary>(vocabulary);

  const setPrefix = (field: TaskField, prefix: string) =>
    setDraft((d) => ({ ...d, prefixes: { ...d.prefixes, [field]: prefix } }));
  const setStatusValues = (status: TaskStatus, values: string[]) =>
    setDraft((d) => ({ ...d, statuses: { ...d.statuses, [status]: values } }));

  const example = `${draft.prefixes.status}${draft.statuses.todo[0] ?? ""}`;

  return (
    <Stack gap="lg">
      <Alert variant="light" color="gray" icon={<IconInfoCircle />}>
        {t(
          "The board reads tasks from page labels. Changing these words doesn't rename the labels already on pages.",
        )}
      </Alert>

      <Stack gap="xs">
        <Title order={5}>{t("Prefixes")}</Title>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
          {FIELDS.map(({ field, name }) => (
            <TextInput
              key={field}
              label={t(name)}
              value={draft.prefixes[field]}
              onChange={(e) => setPrefix(field, e.currentTarget.value)}
              spellCheck={false}
            />
          ))}
        </SimpleGrid>
      </Stack>

      <Stack gap="xs">
        <Title order={5}>{t("Columns")}</Title>
        <Text size="sm" c="dimmed">
          {t(
            "The first value is written when a card moves; the others are also read.",
          )}{" "}
          {t("Example")}: <Code>{example}</Code>
        </Text>
        {statuses.map((status) => (
          <TagsInput
            key={status}
            label={
              <Group gap={6} component="span">
                <StatusDot status={status} />
                {statusName(status, t)}
              </Group>
            }
            value={draft.statuses[status] ?? []}
            onChange={(values) => setStatusValues(status, values)}
            splitChars={[",", " "]}
          />
        ))}
      </Stack>

      <Stack gap="xs">
        <Title order={5}>{t("Priorities")}</Title>
        <TagsInput
          description={t(
            "Most urgent first: the board orders and colors them.",
          )}
          aria-label={t("Priorities")}
          value={draft.priorities}
          onChange={(priorities) => setDraft((d) => ({ ...d, priorities }))}
          splitChars={[",", " "]}
        />
      </Stack>

      <Group justify="flex-end">
        <Button
          onClick={() => save.mutate(draft, { onSuccess: () => onSaved?.() })}
          loading={save.isPending}
        >
          {t("Save")}
        </Button>
      </Group>
    </Stack>
  );
}
