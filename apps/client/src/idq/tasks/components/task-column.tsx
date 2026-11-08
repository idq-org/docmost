import React, { useState } from "react";
import { Badge, Button, Group, Text, TextInput } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { IBoardTask, TaskStatus } from "../types";
import { TaskCard } from "./task-card";
import classes from "./task-board.module.css";

type TaskColumnProps = {
  title: string;
  color: string;
  /** null for the column of the statuses the board doesn't know. */
  status: TaskStatus | null;
  tasks: IBoardTask[];
  spaceSlug: string;
  canCreate: boolean;
  draggedTask: IBoardTask | null;
  onDragStart: (task: IBoardTask) => void;
  onDragEnd: () => void;
  onMove: (task: IBoardTask, status: TaskStatus) => void;
  onCreate?: (title: string, status: TaskStatus) => Promise<unknown>;
};

export function TaskColumn({
  title,
  color,
  status,
  tasks,
  spaceSlug,
  canCreate,
  draggedTask,
  onDragStart,
  onDragEnd,
  onMove,
  onCreate,
}: TaskColumnProps) {
  const [over, setOver] = useState(false);

  const accepts =
    status !== null &&
    draggedTask !== null &&
    draggedTask.canEdit &&
    draggedTask.status !== status;

  return (
    <section
      className={clsx(
        classes.column,
        over && accepts && classes.columnDropTarget,
      )}
      aria-label={title}
      onDragOver={(e: React.DragEvent) => {
        if (!accepts) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(e: React.DragEvent) => {
        // Only when leaving the column, not when moving between its cards.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        if (accepts) onMove(draggedTask, status);
      }}
    >
      <Group className={classes.columnHeader} gap={8} wrap="nowrap">
        <span
          className={classes.dot}
          style={{ background: `var(--mantine-color-${color}-6)` }}
        />
        <Text size="sm" fw={600} style={{ flex: 1 }} truncate>
          {title}
        </Text>
        <Badge size="sm" variant="default" radius="sm">
          {tasks.length}
        </Badge>
      </Group>

      <div className={classes.cards}>
        {tasks.map((task) => (
          <TaskCard
            key={task.pageId}
            task={task}
            spaceSlug={spaceSlug}
            dragging={draggedTask?.pageId === task.pageId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onMove={onMove}
          />
        ))}
      </div>

      {canCreate && status !== null && onCreate && (
        <NewTask onCreate={(name) => onCreate(name, status)} />
      )}
    </section>
  );
}

function NewTask({
  onCreate,
}: {
  onCreate: (title: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <Button
        variant="subtle"
        color="gray"
        size="xs"
        justify="flex-start"
        leftSection={<IconPlus size={14} />}
        onClick={() => setEditing(true)}
      >
        {t("New task")}
      </Button>
    );
  }

  const submit = async () => {
    const title = value.trim();
    if (!title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onCreate(title);
      setValue("");
    } catch {
      // The mutation shows the error; keep the text to try again.
    } finally {
      setSaving(false);
    }
  };

  return (
    <TextInput
      autoFocus
      size="sm"
      placeholder={t("Task title")}
      aria-label={t("Task title")}
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") {
          setValue("");
          setEditing(false);
        }
      }}
      onBlur={() => {
        if (!value.trim() && !saving) setEditing(false);
      }}
      description={t("Enter to create, Esc to cancel")}
    />
  );
}
