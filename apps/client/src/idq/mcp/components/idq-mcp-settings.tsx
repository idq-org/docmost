import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import CopyTextButton from "@/components/common/copy";
import { getAppUrl } from "@/lib/config.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  useCreateIdqApiKeyMutation,
  useIdqApiKeysQuery,
  useIdqSettingsQuery,
  useRevokeIdqApiKeyMutation,
  useUpdateIdqSettingsMutation,
} from "../queries/idq-api-key-query";
import { IIdqApiKeyCreated } from "../services/idq-api-key-service";
import "../i18n";

function CopyableCode({ value, label }: { value: string; label: string }) {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Code
        block
        style={{ flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all" }}
      >
        {value}
      </Code>
      <CopyTextButton text={value} label={label} />
    </Group>
  );
}

function formatDate(value: string | null, language: string, never: string) {
  if (!value) return never;
  return new Date(value).toLocaleDateString(language, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function McpSwitch() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { data: settings } = useIdqSettingsQuery();
  const updateSettings = useUpdateIdqSettingsMutation();
  const enabled = settings?.idqMcpEnabled ?? false;

  if (!isAdmin) {
    return (
      <Alert
        icon={<IconInfoCircle />}
        color={enabled ? "teal" : "gray"}
        variant="light"
      >
        {enabled
          ? t("MCP is enabled for this workspace.")
          : t("MCP is disabled. Ask a workspace admin to enable it.")}
      </Alert>
    );
  }

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Enable MCP")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Lets members connect AI assistants to the workspace with their API keys. Assistants only see what each member can see.",
          )}
        </Text>
      </div>
      <Switch
        checked={enabled}
        disabled={!settings || updateSettings.isPending}
        onChange={(e) =>
          updateSettings.mutate({ idqMcpEnabled: e.currentTarget.checked })
        }
        aria-label={t("Enable MCP")}
      />
    </Group>
  );
}

function ConnectionHelp() {
  const { t } = useTranslation();
  const endpoint = getAppUrl() + "/mcp";
  const placeholder = t("<key>");

  return (
    <Stack gap="sm">
      <TextInput
        label={t("MCP server URL")}
        value={endpoint}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        rightSection={
          <CopyTextButton text={endpoint} label={t("Copy MCP server URL")} />
        }
      />

      <Text size="sm" fw={500}>
        {t("How to connect")}
      </Text>
      <Text size="sm" c="dimmed">
        {t("Claude Code")}
      </Text>
      <CopyableCode
        value={`claude mcp add idq --transport http ${endpoint} --header "Authorization: Bearer ${placeholder}"`}
        label={t("Copy command")}
      />
      <Text size="sm" c="dimmed">
        {t("Claude Desktop, Cursor and other clients (via mcp-remote)")}
      </Text>
      <CopyableCode
        value={`npx -y mcp-remote ${endpoint} --header "Authorization: Bearer ${placeholder}"`}
        label={t("Copy command")}
      />
      <Text size="xs" c="dimmed">
        {t("Replace {{placeholder}} with one of your API keys.", {
          placeholder,
        })}
      </Text>
    </Stack>
  );
}

const EXPIRATION_DAYS: Record<string, number | null> = {
  "30": 30,
  "90": 90,
  "365": 365,
  never: null,
};

function CreateKeyModal({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (key: IIdqApiKeyCreated) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [expiration, setExpiration] = useState<string>("90");
  const createKey = useCreateIdqApiKeyMutation();

  const submit = async () => {
    const days = EXPIRATION_DAYS[expiration];
    const created = await createKey.mutateAsync({
      name: name.trim(),
      expiresAt: days
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
    });
    setName("");
    setExpiration("90");
    onCreated(created);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Create API key")}>
      <Stack>
        <TextInput
          label={t("Name")}
          placeholder={t("e.g. Claude on my laptop")}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.currentTarget.value)}
          data-autofocus
        />
        <Select
          label={t("Expiration")}
          value={expiration}
          onChange={(v) => setExpiration(v ?? "90")}
          allowDeselect={false}
          data={[
            { value: "30", label: t("30 days") },
            { value: "90", label: t("90 days") },
            { value: "365", label: t("1 year") },
            { value: "never", label: t("No expiration") },
          ]}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim()}
            loading={createKey.isPending}
          >
            {t("Create")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ApiKeys() {
  const { t, i18n } = useTranslation();
  const { data: keys } = useIdqApiKeysQuery();
  const revokeKey = useRevokeIdqApiKeyMutation();
  const [createOpened, setCreateOpened] = useState(false);
  const [createdKey, setCreatedKey] = useState<IIdqApiKeyCreated | null>(null);

  const confirmRevoke = (id: string, name: string) =>
    modals.openConfirmModal({
      title: t("Revoke API key"),
      children: (
        <Text size="sm">
          {t(
            'Revoke the key "{{name}}"? Assistants using it will stop working immediately.',
            { name },
          )}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => revokeKey.mutate(id),
    });

  const never = t("Never");

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={4}>{t("API keys")}</Title>
        <Button onClick={() => setCreateOpened(true)}>
          {t("Create API key")}
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        {t(
          "Personal keys to use the MCP server. Each key acts as you: an assistant that uses it can do what you can do. Revoke a key as soon as you no longer need it.",
        )}
      </Text>

      {keys && keys.length === 0 && (
        <Text size="sm" c="dimmed">
          {t("You have no API keys yet.")}
        </Text>
      )}

      {keys && keys.length > 0 && (
        <Table.ScrollContainer minWidth={600}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Name")}</Table.Th>
                <Table.Th>{t("Key")}</Table.Th>
                <Table.Th>{t("Created")}</Table.Th>
                <Table.Th>{t("Last used")}</Table.Th>
                <Table.Th>{t("Expires")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {keys.map((key) => (
                <Table.Tr key={key.id}>
                  <Table.Td>{key.name}</Table.Td>
                  <Table.Td>
                    <Code>{key.keyHint}…</Code>
                  </Table.Td>
                  <Table.Td>
                    {formatDate(key.createdAt, i18n.language, never)}
                  </Table.Td>
                  <Table.Td>
                    {formatDate(key.lastUsedAt, i18n.language, never)}
                  </Table.Td>
                  <Table.Td>
                    {key.expiresAt &&
                    new Date(key.expiresAt).getTime() <= Date.now() ? (
                      <Badge color="gray" variant="light">
                        {t("Expired")}
                      </Badge>
                    ) : (
                      formatDate(key.expiresAt, i18n.language, never)
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => confirmRevoke(key.id, key.name)}
                    >
                      {t("Revoke")}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <CreateKeyModal
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
        onCreated={(key) => {
          setCreateOpened(false);
          setCreatedKey(key);
        }}
      />

      <Modal
        opened={Boolean(createdKey)}
        onClose={() => setCreatedKey(null)}
        title={t("Copy your API key")}
        closeOnClickOutside={false}
      >
        <Stack>
          <Text size="sm">
            {t(
              "This is the only time the key is shown. Copy it now and keep it somewhere safe.",
            )}
          </Text>
          {createdKey && (
            <CopyableCode value={createdKey.key} label={t("Copy API key")} />
          )}
          <Group justify="flex-end">
            <Button onClick={() => setCreatedKey(null)}>{t("Done")}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

export default function IdqMcpSettings() {
  const { t } = useTranslation();

  return (
    <Stack gap="xl">
      <Text size="sm" c="dimmed">
        {t(
          "IDQ MCP server, compatible with clients of the Docmost MCP. Connect an AI assistant (Claude, ChatGPT, Cursor, VS Code…) to read and write pages with your permissions.",
        )}
      </Text>
      <McpSwitch />
      <ConnectionHelp />
      <ApiKeys />
      <Text size="xs" c="dimmed">
        {t(
          "Not an official Docmost feature: it is developed by Informatici di Quartiere.",
        )}
      </Text>
    </Stack>
  );
}
