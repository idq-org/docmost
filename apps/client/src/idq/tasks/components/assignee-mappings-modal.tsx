import {
  Code,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  useAssigneeMappingsQuery,
  useSetAssigneeMappingMutation,
  useTaskFieldOptionsQuery,
} from "../queries/idq-task-query";

type AssigneeMappingsModalProps = {
  spaceId: string;
  opened: boolean;
  onClose: () => void;
};

/**
 * Workspace admins choose who each `ref-` label stands for: a first name
 * can belong to several members, or an account can have another name.
 */
export function AssigneeMappingsModal({
  spaceId,
  opened,
  onClose,
}: AssigneeMappingsModalProps) {
  const { t } = useTranslation();
  const { data: mappings, isLoading } = useAssigneeMappingsQuery(opened);
  const { data: options } = useTaskFieldOptionsQuery(spaceId, opened);
  const setMapping = useSetAssigneeMappingMutation();

  const members = (options?.members ?? []).map((m) => ({
    value: m.id,
    label: m.name || m.value,
  }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("People in charge")}
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            "Choose who each ref- label stands for. Without a choice, the label is matched with a member's name or email, when only one member fits.",
          )}
        </Text>

        {isLoading || !options ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : mappings && mappings.length > 0 ? (
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
                    <Code>ref-{row.value}</Code>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      aria-label={t("Member for ref-{{value}}", {
                        value: row.value,
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
                        setMapping.mutate({ value: row.value, userId })
                      }
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm">{t("There are no ref- labels yet.")}</Text>
        )}
      </Stack>
    </Modal>
  );
}
