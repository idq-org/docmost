import { useState } from "react";
import {
  Button,
  FileButton,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  IconExternalLink,
  IconFileDescription,
  IconPaperclip,
  IconSearch,
  IconUpload,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { searchSuggestions, uploadFile } from "@/idq/core/docmost";
import { searchTaskAttachments } from "../services/idq-task-service";
import { useAddTaskLinkMutation } from "../queries/idq-task-query";
import { formatFileSize } from "../task-display";
import classes from "./task-panel.module.css";

type AddMaterialModalProps = {
  taskPageId: string;
  spaceId: string;
  opened: boolean;
  onClose: () => void;
};

export function AddMaterialModal({
  taskPageId,
  spaceId,
  opened,
  onClose,
}: AddMaterialModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Link material")}
      size="lg"
    >
      <Tabs defaultValue="page" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab
            value="page"
            leftSection={<IconFileDescription size={16} />}
          >
            {t("Page")}
          </Tabs.Tab>
          <Tabs.Tab
            value="attachment"
            leftSection={<IconPaperclip size={16} />}
          >
            {t("File")}
          </Tabs.Tab>
          <Tabs.Tab value="url" leftSection={<IconExternalLink size={16} />}>
            {t("External link")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="page">
          <PagePicker
            taskPageId={taskPageId}
            spaceId={spaceId}
            onDone={onClose}
          />
        </Tabs.Panel>
        <Tabs.Panel value="attachment">
          <AttachmentPicker taskPageId={taskPageId} onDone={onClose} />
        </Tabs.Panel>
        <Tabs.Panel value="url">
          <UrlForm taskPageId={taskPageId} onDone={onClose} />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

function PagePicker({
  taskPageId,
  spaceId,
  onDone,
}: {
  taskPageId: string;
  spaceId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query.trim(), 250);
  const addLink = useAddTaskLinkMutation(taskPageId);

  // Docmost's page suggestions: only pages the user can open, current space
  // first.
  const { data, isFetching } = useQuery({
    queryKey: ["idq-task-page-search", debounced, spaceId],
    queryFn: () =>
      searchSuggestions({
        query: debounced,
        includePages: true,
        spaceId,
        limit: 20,
      }),
    enabled: debounced.length > 0,
    placeholderData: keepPreviousData,
  });
  const pages = (data?.pages ?? []).filter((p) => p && p.id !== taskPageId);

  return (
    <Stack gap="sm">
      <TextInput
        data-autofocus
        leftSection={<IconSearch size={16} />}
        placeholder={t("Search pages")}
        aria-label={t("Search pages")}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <ScrollArea.Autosize mah={320}>
        <Stack gap={2}>
          {debounced.length > 0 && !isFetching && pages.length === 0 && (
            <Text size="sm" c="dimmed">
              {t("No pages found")}
            </Text>
          )}
          {pages.map((page) => (
            <UnstyledButton
              key={page.id}
              className={classes.pickerRow}
              disabled={addLink.isPending}
              onClick={() =>
                addLink.mutate(
                  { taskPageId, type: "page", targetPageId: page.id },
                  { onSuccess: onDone },
                )
              }
            >
              <Group gap="xs" wrap="nowrap">
                <Text size="sm">{page.icon || "📄"}</Text>
                <Text size="sm" truncate>
                  {page.title || t("Untitled")}
                </Text>
                {page.space?.name && (
                  <Text size="xs" c="dimmed" ml="auto" truncate>
                    {page.space.name}
                  </Text>
                )}
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}

function AttachmentPicker({
  taskPageId,
  onDone,
}: {
  taskPageId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query.trim(), 250);
  const [uploading, setUploading] = useState(false);
  const addLink = useAddTaskLinkMutation(taskPageId);

  const { data: attachments = [], isFetching } = useQuery({
    queryKey: ["idq-task-attachment-search", debounced],
    queryFn: () => searchTaskAttachments(debounced),
    placeholderData: keepPreviousData,
  });

  const link = (attachmentId: string) =>
    addLink.mutate(
      { taskPageId, type: "attachment", attachmentId },
      { onSuccess: onDone },
    );

  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      // The file becomes an attachment of the task page.
      const attachment = await uploadFile(file, taskPageId);
      link(attachment.id);
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to upload the file"),
        color: "red",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" c="dimmed">
          {t("Upload a file to this task, or link a file already in Docmost.")}
        </Text>
        <FileButton onChange={upload}>
          {(props) => (
            <Button
              {...props}
              size="xs"
              variant="light"
              loading={uploading}
              leftSection={<IconUpload size={14} />}
            >
              {t("Upload file")}
            </Button>
          )}
        </FileButton>
      </Group>

      <TextInput
        leftSection={<IconSearch size={16} />}
        placeholder={t("Search files by name")}
        aria-label={t("Search files by name")}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <ScrollArea.Autosize mah={300}>
        <Stack gap={2}>
          {!isFetching && attachments.length === 0 && (
            <Text size="sm" c="dimmed">
              {t("No files found")}
            </Text>
          )}
          {attachments.map((attachment) => (
            <UnstyledButton
              key={attachment.id}
              className={classes.pickerRow}
              disabled={addLink.isPending}
              onClick={() => link(attachment.id)}
            >
              <Group gap="xs" wrap="nowrap">
                <IconPaperclip size={16} />
                <Text size="sm" truncate>
                  {attachment.fileName}
                </Text>
                {attachment.fileSize !== null && (
                  <Text size="xs" c="dimmed" ml="auto">
                    {formatFileSize(attachment.fileSize)}
                  </Text>
                )}
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}

function UrlForm({
  taskPageId,
  onDone,
}: {
  taskPageId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addLink = useAddTaskLinkMutation(taskPageId);

  const submit = () => {
    const value = url.trim();
    let parsed: URL | null = null;
    try {
      parsed = new URL(value);
    } catch {
      parsed = null;
    }
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
      setError(t("Enter a web address that starts with https://"));
      return;
    }
    setError(null);
    addLink.mutate(
      {
        taskPageId,
        type: "url",
        url: value,
        title: title.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Stack gap="sm">
        <TextInput
          data-autofocus
          label={t("Address")}
          placeholder="https://drive.google.com/…"
          value={url}
          error={error}
          onChange={(e) => setUrl(e.currentTarget.value)}
          required
        />
        <TextInput
          label={t("Title")}
          description={t("Optional: shown instead of the address")}
          value={title}
          maxLength={255}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button type="submit" loading={addLink.isPending}>
            {t("Add the link")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
