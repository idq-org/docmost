import { Code, Group, Loader, Select, Stack, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/idq/core/docmost";
import {
  taskKeys,
  useAssigneeMappingsQuery,
  useSetAssigneeMappingMutation,
} from "../queries/idq-task-query";
import { useTaskSettings } from "../hooks/use-task-settings";

/** A member to link a label to (POST /idq/tasks/assignees/members). */
type MappableMember = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

/**
 * Every member of the workspace, with their email (admins only). Not the
 * members of the task pickers: those leave out the members that no label
 * value resolves to, who are the ones that need a link.
 */
function useMappableMembersQuery() {
  return useQuery({
    queryKey: [...taskKeys.all, "assignee-members"],
    queryFn: async () =>
      (await api.post<MappableMember[]>("/idq/tasks/assignees/members")).data,
  });
}

/**
 * Who each person-in-charge label stands for: a first name can belong to
 * several members, or an account can have another name. Workspace admins
 * only (the server checks). spaceId is not used: members and mappings are
 * the same in every space.
 */
export function AssigneeMappings(_props: { spaceId?: string }) {
  const { t } = useTranslation();
  const { vocabulary } = useTaskSettings();
  const { data: mappings, isLoading } = useAssigneeMappingsQuery(true);
  const { data: candidates } = useMappableMembersQuery();
  const setMapping = useSetAssigneeMappingMutation();
  const prefix = vocabulary?.prefixes.assignee ?? "";

  if (isLoading || !candidates) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    );
  }

  // The email tells apart members with the same name.
  const members = candidates.map((m) => ({
    value: m.id,
    label: m.name ? `${m.name} (${m.email})` : m.email,
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
