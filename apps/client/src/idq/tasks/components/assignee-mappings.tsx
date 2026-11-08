import { Code, Group, Loader, Select, Stack, Table, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  useAssigneeMappingsQuery,
  useSetAssigneeMappingMutation,
  useTaskFieldOptionsQuery,
} from "../queries/idq-task-query";
import { useTaskSettings } from "../hooks/use-task-settings";

/**
 * Who each person-in-charge label stands for: a first name can belong to
 * several members, or an account can have another name. Workspace admins
 * only (the server checks).
 */
export function AssigneeMappings({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { vocabulary } = useTaskSettings();
  const { data: mappings, isLoading } = useAssigneeMappingsQuery(true);
  const { data: options } = useTaskFieldOptionsQuery(spaceId, true);
  const setMapping = useSetAssigneeMappingMutation();
  const prefix = vocabulary?.prefixes.assignee ?? "";

  if (isLoading || !options) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    );
  }

  const members = options.members.map((m) => ({
    value: m.id,
    label: m.name || m.value,
  }));

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t(
          "Choose who each person-in-charge label stands for. Without a choice, the label is matched with a member's name or email, when only one member fits.",
        )}
      </Text>

      {mappings && mappings.length > 0 ? (
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Label")}</Table.Th>
              <Table.Th>{t("Member")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {mappings.map((row) => (
              <Table.Tr key={row.value}>
                <Table.Td>
                  <Code>
                    {prefix}
                    {row.value}
                  </Code>
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    aria-label={t("Member for {{label}}", {
                      label: prefix + row.value,
                    })}
                    data={members}
                    value={row.user?.id ?? null}
                    searchable
                    clearable
                    disabled={setMapping.isPending}
                    placeholder={
                      row.automatic
                        ? t("Automatic: {{name}}", {
                            name: row.automatic.name,
                          })
                        : t("No member: shown as a name")
                    }
                    onChange={(userId) =>
                      setMapping.mutate({
                        value: row.value,
                        userId: userId === null ? null : String(userId),
                      })
                    }
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text size="sm">{t("No person-in-charge labels yet.")}</Text>
      )}
    </Stack>
  );
}
