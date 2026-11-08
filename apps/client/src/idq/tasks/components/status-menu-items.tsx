import { Menu } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useTaskSettings } from "../hooks/use-task-settings";
import { statusColor, statusName } from "../task-display";
import { TaskStatus } from "../types";
import classes from "./task-board.module.css";

type StatusMenuItemsProps = {
  current: TaskStatus | null;
  disabled?: boolean;
  onSelect: (status: TaskStatus) => void;
};

/** One menu item per column, to move a task without dragging it. */
export function StatusMenuItems({
  current,
  disabled,
  onSelect,
}: StatusMenuItemsProps) {
  const { t } = useTranslation();
  const { statuses } = useTaskSettings();

  return (
    <>
      {statuses.map((status) => (
        <Menu.Item
          key={status}
          disabled={disabled || status === current}
          leftSection={<StatusDot status={status} />}
          rightSection={status === current ? <IconCheck size={14} /> : null}
          onClick={() => onSelect(status)}
        >
          {statusName(status, t)}
        </Menu.Item>
      ))}
    </>
  );
}

export function StatusDot({ status }: { status: TaskStatus | null }) {
  return (
    <span
      className={classes.dot}
      style={{ background: `var(--mantine-color-${statusColor(status)}-6)` }}
    />
  );
}
