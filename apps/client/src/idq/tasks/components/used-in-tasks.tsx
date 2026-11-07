import { Badge, Group, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { statusColor } from "../task-display";
import { ITaskUsage } from "../types";
import classes from "./task-panel.module.css";

/** The tasks that link this page as material, colored by status. */
export function UsedInTasks({ tasks }: { tasks: ITaskUsage[] }) {
  const { t } = useTranslation();
  return (
    <Group gap={6} wrap="wrap">
      <Text size="xs" fw={600} c="dimmed" className={classes.sectionTitle}>
        {t("Used in tasks")}
      </Text>
      {tasks.map((task) => (
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
          className={classes.usedInBadge}
        >
          {task.icon ? `${task.icon} ` : ""}
          {task.title || t("Untitled")}
        </Badge>
      ))}
    </Group>
  );
}
