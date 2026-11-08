import React from "react";
import {
  ActionIcon,
  Avatar,
  Badge,
  Group,
  Menu,
  Paper,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowsExchange,
  IconCalendarEvent,
  IconDots,
  IconPaperclip,
} from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { buildPageUrl, CustomAvatar } from "@/idq/core/docmost";
import { IBoardTask, ITaskAssignee, TaskStatus } from "../types";
import {
  formatDeadline,
  isOverdue,
  labelValueText,
  priorityColor,
} from "../task-display";
import { useTaskSettings } from "../hooks/use-task-settings";
import { StatusMenuItems } from "./status-menu-items";
import classes from "./task-board.module.css";

type TaskCardProps = {
  task: IBoardTask;
  spaceSlug: string;
  dragging: boolean;
  onDragStart: (task: IBoardTask) => void;
  onDragEnd: () => void;
  onMove: (task: IBoardTask, status: TaskStatus) => void;
};

export function TaskCard({
  task,
  spaceSlug,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: TaskCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { priorities } = useTaskSettings();
  const url = buildPageUrl(spaceSlug, task.slugId, task.title ?? undefined);
  const title = task.title || t("Untitled");
  const overdue = isOverdue(task.nextDeadline);

  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      className={clsx(classes.card, dragging && classes.cardDragging)}
      draggable={task.canEdit}
      onDragStart={(e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.pageId);
        // Changing the dragged element during dragstart makes some browsers
        // cancel the drag: update the board on the next tick.
        setTimeout(() => onDragStart(task), 0);
      }}
      onDragEnd={onDragEnd}
      onClick={(e: React.MouseEvent) => {
        // The title link and the menu handle their own clicks.
        if ((e.target as HTMLElement).closest("a, button, [role=menu]")) return;
        navigate(url);
      }}
      data-task-id={task.pageId}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap={4}>
        <Text
          component={Link}
          to={url}
          draggable={false}
          size="sm"
          fw={500}
          className={classes.cardTitle}
        >
          {task.icon ? `${task.icon} ` : ""}
          {title}
        </Text>

        {task.canEdit && (
          <MoveMenu task={task} onMove={(status) => onMove(task, status)} />
        )}
      </Group>

      <Group gap={6} mt={8} wrap="wrap">
        {task.status === null && (
          <Badge size="sm" variant="outline" color="gray" radius="sm">
            {labelValueText(task.statusValue)}
          </Badge>
        )}

        {task.priority && (
          <Badge
            size="sm"
            variant="light"
            color={priorityColor(task.priority, priorities)}
            radius="sm"
          >
            {labelValueText(task.priority)}
          </Badge>
        )}

        {task.nextDeadline && (
          <Tooltip
            label={[
              overdue ? t("Overdue") : t("Next deadline"),
              task.nextDeadline.title,
            ]
              .filter(Boolean)
              .join(" · ")}
            withArrow
          >
            <Badge
              size="sm"
              radius="sm"
              variant={overdue ? "filled" : "light"}
              color={overdue ? "red" : "gray"}
              leftSection={<IconCalendarEvent size={12} />}
            >
              {formatDeadline(task.nextDeadline, i18n.language)}
            </Badge>
          </Tooltip>
        )}

        {task.linkCount > 0 && (
          <Tooltip
            label={t("{{count}} linked materials", { count: task.linkCount })}
            withArrow
          >
            <Group gap={2} c="dimmed" wrap="nowrap">
              <IconPaperclip size={14} />
              <Text size="xs">{task.linkCount}</Text>
            </Group>
          </Tooltip>
        )}

        {task.assignees.length > 0 && <Assignees assignees={task.assignees} />}
      </Group>
    </Paper>
  );
}

function Assignees({ assignees }: { assignees: ITaskAssignee[] }) {
  const shown = assignees.slice(0, 3);
  const others = assignees.length - shown.length;
  return (
    <Tooltip
      label={assignees.map((a) => a.name).join(", ")}
      withArrow
      multiline
    >
      <Avatar.Group spacing={6} ml="auto">
        {shown.map((a) => (
          <CustomAvatar
            key={a.value}
            avatarUrl={a.user?.avatarUrl ?? undefined}
            name={a.name}
            size={22}
            radius="xl"
          />
        ))}
        {others > 0 && (
          <Avatar size={22} radius="xl">
            +{others}
          </Avatar>
        )}
      </Avatar.Group>
    </Tooltip>
  );
}

function MoveMenu({
  task,
  onMove,
}: {
  task: IBoardTask;
  onMove: (status: TaskStatus) => void;
}) {
  const { t } = useTranslation();
  return (
    <Menu position="bottom-end" withinPortal shadow="md" width={200}>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={t("Move to")}
          className={classes.cardMenu}
        >
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Group gap={4}>
            <IconArrowsExchange size={14} />
            {t("Move to")}
          </Group>
        </Menu.Label>
        <StatusMenuItems current={task.status} onSelect={onMove} />
      </Menu.Dropdown>
    </Menu>
  );
}
