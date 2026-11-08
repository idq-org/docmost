import {
  ActionIcon,
  Anchor,
  Badge,
  Divider,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconCalendarEvent,
  IconChevronDown,
  IconLayoutKanban,
  IconPencil,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/idq/core/docmost";
import {
  usePageTaskQuery,
  useSetTaskStatusMutation,
} from "../queries/idq-task-query";
import { useRefreshOnLabelChange } from "../hooks/use-refresh-on-label-change";
import { useTaskSettings } from "../hooks/use-task-settings";
import { IPageTaskInfo, TaskStatus } from "../types";
import {
  formatDeadline,
  isOverdue,
  labelValueText,
  priorityColor,
  statusColor,
  statusName,
  taskBoardUrl,
} from "../task-display";
import { PageBlock } from "@/idq/core/page-block";
import { StatusMenuItems } from "./status-menu-items";
import { TaskFieldsModal } from "./task-fields-modal";
import { LinkedMaterials } from "./linked-materials";
import { UsedInTasks } from "./used-in-tasks";
import "../i18n";

type TaskPagePanelProps = {
  pageId: string;
  spaceId: string;
  spaceSlug: string;
};

/**
 * Box under the page title: the task fields and linked materials when the
 * page is a task, and the tasks that use the page. Nothing otherwise.
 */
export function TaskPagePanel({
  pageId,
  spaceId,
  spaceSlug,
}: TaskPagePanelProps) {
  useRefreshOnLabelChange(pageId);
  const { data: info } = usePageTaskQuery(pageId);

  if (!info || (!info.task && info.usedIn.length === 0)) return null;

  return (
    <PageBlock>
      <Stack gap="xs">
        {info.task && (
          <>
            <TaskFields info={info} spaceId={spaceId} spaceSlug={spaceSlug} />
            <LinkedMaterials
              taskPageId={info.pageId}
              spaceId={spaceId}
              spaceSlug={spaceSlug}
              links={info.links}
              canEdit={info.canEdit}
            />
          </>
        )}
        {info.usedIn.length > 0 && (
          <>
            {info.task && <Divider />}
            <UsedInTasks tasks={info.usedIn} />
          </>
        )}
      </Stack>
    </PageBlock>
  );
}

function TaskFields({
  info,
  spaceId,
  spaceSlug,
}: {
  info: IPageTaskInfo;
  spaceId: string;
  spaceSlug: string;
}) {
  const { t, i18n } = useTranslation();
  const { priorities } = useTaskSettings();
  const [editing, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const task = info.task;
  const overdue = isOverdue(task.nextDeadline);
  const editLabel = t("Edit priority, area and people in charge");

  return (
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
          color={priorityColor(task.priority, priorities)}
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
        <>
          <Tooltip label={editLabel} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={editLabel}
              onClick={openEdit}
            >
              <IconPencil size={14} />
            </ActionIcon>
          </Tooltip>
          <TaskFieldsModal
            info={info}
            spaceId={spaceId}
            opened={editing}
            onClose={closeEdit}
          />
        </>
      )}

      <Anchor component={Link} to={taskBoardUrl(spaceSlug)} size="xs" ml="auto">
        <Group gap={4} wrap="nowrap">
          <IconLayoutKanban size={14} />
          {t("Open board")}
        </Group>
      </Anchor>
    </Group>
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
        <StatusMenuItems
          current={status}
          disabled={setStatus.isPending}
          onSelect={(next) => setStatus.mutate({ pageId, status: next })}
        />
      </Menu.Dropdown>
    </Menu>
  );
}
