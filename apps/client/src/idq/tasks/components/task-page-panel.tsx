import type { ReactNode } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Paper,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import {
  IconCalendarEvent,
  IconCheck,
  IconChevronDown,
  IconExternalLink,
  IconFileDescription,
  IconLayoutKanban,
  IconPaperclip,
  IconPencil,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { getPageLabels } from "@/features/label/services/label-service.ts";
import { getFileUrl } from "@/lib/config.ts";
import {
  usePageTaskQuery,
  useRemoveTaskLinkMutation,
  useSetTaskStatusMutation,
} from "../queries/idq-task-query";
import { IPageTaskInfo, ITaskLink, TASK_STATUSES, TaskStatus } from "../types";
import {
  formatDeadline,
  formatFileSize,
  isOverdue,
  labelValueText,
  priorityColor,
  statusColor,
  statusName,
  taskBoardUrl,
} from "../task-display";
import { AddMaterialModal } from "./add-material-modal";
import { TaskFieldsModal } from "./task-fields-modal";
import classes from "./task-panel.module.css";
import "../i18n";

type TaskPagePanelProps = {
  pageId: string;
  spaceId: string;
  spaceSlug: string;
};

/**
 * Box under the page title: task fields and linked materials when the page
 * is a task, and the tasks that use the page. Renders nothing otherwise.
 */
export function TaskPagePanel({
  pageId,
  spaceId,
  spaceSlug,
}: TaskPagePanelProps) {
  // Reload when the labels change in the page details (same cache entry as
  // Docmost's labels section; this observer never fetches by itself).
  const { dataUpdatedAt: labelsVersion } = useQuery({
    queryKey: ["page-labels", pageId],
    queryFn: () => getPageLabels({ pageId, limit: 100 }),
    enabled: false,
  });
  const { data: info } = usePageTaskQuery(pageId, String(labelsVersion));

  if (!info || info.pageId !== pageId) return null;
  if (!info.isTask && info.usedIn.length === 0) return null;

  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      className={`print-hide ${classes.panel}`}
    >
      <Stack gap="xs">
        {info.isTask && info.task && (
          <TaskSection info={info} spaceId={spaceId} spaceSlug={spaceSlug} />
        )}
        {info.usedIn.length > 0 && (
          <>
            {info.isTask && <Divider />}
            <UsedIn info={info} />
          </>
        )}
      </Stack>
    </Paper>
  );
}

function TaskSection({
  info,
  spaceId,
  spaceSlug,
}: {
  info: IPageTaskInfo;
  spaceId: string;
  spaceSlug: string;
}) {
  const { t, i18n } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const task = info.task;
  const overdue = isOverdue(task.nextDeadline);

  return (
    <>
      <Group gap="xs" wrap="wrap">
        <StatusControl
          pageId={info.pageId}
          spaceId={spaceId}
          status={task.status}
          statusValue={task.statusValue}
          canEdit={info.canEdit}
        />

        {task.priority && (
          <Badge
            variant="light"
            radius="sm"
            color={priorityColor(task.priority)}
          >
            {t("Priority")}: {labelValueText(task.priority)}
          </Badge>
        )}

        {task.areas.map((area) => (
          <Badge key={area} variant="outline" color="gray" radius="sm">
            {labelValueText(area)}
          </Badge>
        ))}

        {task.nextDeadline && (
          <Tooltip
            label={task.nextDeadline.title ?? t("Next deadline")}
            withArrow
          >
            <Badge
              radius="sm"
              variant={overdue ? "filled" : "light"}
              color={overdue ? "red" : "gray"}
              leftSection={<IconCalendarEvent size={12} />}
            >
              {formatDeadline(task.nextDeadline, i18n.language)}
            </Badge>
          </Tooltip>
        )}

        {task.assignees.map((a) => (
          <Group key={a.value} gap={4} wrap="nowrap">
            <CustomAvatar
              avatarUrl={a.user?.avatarUrl ?? undefined}
              name={a.name}
              size={20}
              radius="xl"
            />
            <Text size="sm">{a.name}</Text>
          </Group>
        ))}
        {task.assignees.length === 0 && (
          <Text size="sm" c="dimmed">
            {t("To be assigned")}
          </Text>
        )}

        {info.canEdit && (
          <Tooltip
            label={t("Edit priority, area and people in charge")}
            withArrow
          >
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={t("Edit priority, area and people in charge")}
              onClick={openEdit}
            >
              <IconPencil size={14} />
            </ActionIcon>
          </Tooltip>
        )}

        <Anchor
          component={Link}
          to={taskBoardUrl(spaceSlug)}
          size="xs"
          ml="auto"
        >
          <Group gap={4} wrap="nowrap">
            <IconLayoutKanban size={14} />
            {t("Open board")}
          </Group>
        </Anchor>
      </Group>

      <Group justify="space-between" mt={4}>
        <Text size="xs" fw={600} c="dimmed" className={classes.sectionTitle}>
          {t("Linked materials")}
        </Text>
        {info.canEdit && (
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconPlus size={14} />}
            onClick={open}
          >
            {t("Add")}
          </Button>
        )}
      </Group>

      {info.links.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("No linked materials yet.")}
        </Text>
      ) : (
        <Stack gap={0}>
          {info.links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              taskPageId={info.pageId}
              currentSpaceSlug={spaceSlug}
              canEdit={info.canEdit}
            />
          ))}
        </Stack>
      )}

      {info.canEdit && (
        <TaskFieldsModal
          info={info}
          spaceId={spaceId}
          opened={editing}
          onClose={closeEdit}
        />
      )}

      {info.canEdit && (
        <AddMaterialModal
          taskPageId={info.pageId}
          spaceId={spaceId}
          opened={opened}
          onClose={close}
        />
      )}
    </>
  );
}

function StatusControl({
  pageId,
  spaceId,
  status,
  statusValue,
  canEdit,
}: {
  pageId: string;
  spaceId: string;
  status: TaskStatus | null;
  statusValue: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const setStatus = useSetTaskStatusMutation(spaceId);
  const label = status ? statusName(status, t) : labelValueText(statusValue);

  const badge = (
    <Badge
      variant="filled"
      radius="sm"
      color={statusColor(status)}
      rightSection={canEdit ? <IconChevronDown size={12} /> : undefined}
      style={canEdit ? { cursor: "pointer" } : undefined}
    >
      {label}
    </Badge>
  );

  if (!canEdit) return badge;

  return (
    <Menu position="bottom-start" shadow="md" width={200}>
      <Menu.Target>
        <UnstyledButton
          aria-label={t("Change status: {{status}}", { status: label })}
        >
          {badge}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {TASK_STATUSES.map((s) => (
          <Menu.Item
            key={s}
            disabled={s === status || setStatus.isPending}
            rightSection={s === status ? <IconCheck size={14} /> : undefined}
            onClick={() => setStatus.mutate({ pageId, status: s })}
          >
            {statusName(s, t)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function LinkRow({
  link,
  taskPageId,
  currentSpaceSlug,
  canEdit,
}: {
  link: ITaskLink;
  taskPageId: string;
  currentSpaceSlug: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const remove = useRemoveTaskLinkMutation(taskPageId);

  let icon = <IconExternalLink size={16} />;
  let target: ReactNode;
  let detail: string | null = null;

  if (link.type === "page" && link.page) {
    icon = link.page.icon ? (
      <Text size="sm">{link.page.icon}</Text>
    ) : (
      <IconFileDescription size={16} />
    );
    target = (
      <Text
        component={Link}
        to={buildPageUrl(
          link.page.spaceSlug ?? undefined,
          link.page.slugId,
          link.page.title ?? undefined,
        )}
        size="sm"
        truncate
        className={classes.linkTitle}
      >
        {link.page.title || t("Untitled")}
      </Text>
    );
    if (link.page.spaceSlug !== currentSpaceSlug) {
      detail = link.page.spaceName;
    }
  } else if (link.type === "attachment" && link.attachment) {
    icon = <IconPaperclip size={16} />;
    target = (
      <Text
        component="a"
        href={getFileUrl(
          `/api/files/${link.attachment.id}/${encodeURIComponent(link.attachment.fileName)}`,
        )}
        target="_blank"
        rel="noopener"
        size="sm"
        truncate
        className={classes.linkTitle}
      >
        {link.attachment.fileName}
      </Text>
    );
    if (link.attachment.fileSize !== null) {
      detail = formatFileSize(link.attachment.fileSize);
    }
  } else if (link.url) {
    target = (
      <Text
        component="a"
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
        truncate
        className={classes.linkTitle}
      >
        {link.title}
      </Text>
    );
    try {
      detail = new URL(link.url).hostname;
    } catch {
      detail = null;
    }
  }

  return (
    <Group gap="xs" wrap="nowrap" className={classes.linkRow}>
      <span
        style={{
          display: "flex",
          flex: "none",
          color: "var(--mantine-color-dimmed)",
        }}
      >
        {icon}
      </span>
      {target}
      {detail && (
        <Text
          size="xs"
          c="dimmed"
          truncate
          style={{ flex: "none", maxWidth: 160 }}
        >
          {detail}
        </Text>
      )}
      {canEdit && (
        <Tooltip label={t("Remove")} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            ml="auto"
            aria-label={t("Remove {{title}}", { title: link.title })}
            onClick={() => remove.mutate(link.id)}
          >
            <IconX size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

function UsedIn({ info }: { info: IPageTaskInfo }) {
  const { t } = useTranslation();
  return (
    <Group gap={6} wrap="wrap">
      <Text size="xs" fw={600} c="dimmed" className={classes.sectionTitle}>
        {t("Used in tasks")}
      </Text>
      {info.usedIn.map((task) => (
        <Badge
          key={task.taskPageId}
          component={Link}
          to={buildPageUrl(
            task.spaceSlug ?? undefined,
            task.slugId,
            task.title ?? undefined,
          )}
          variant="light"
          radius="sm"
          color={statusColor(task.status)}
          style={{ cursor: "pointer", textTransform: "none" }}
        >
          {task.icon ? `${task.icon} ` : ""}
          {task.title || t("Untitled")}
        </Badge>
      ))}
    </Group>
  );
}
