import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAtomValue } from "jotai";
import {
  Alert,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconInfoCircle,
  IconLayoutKanban,
  IconSettings,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  DocumentTitle,
  EmptyState,
  useGetSpaceBySlugQuery,
  userAtom,
  useUserRole,
} from "@/idq/core/docmost";
import {
  useCreateTaskMutation,
  useSetTaskStatusMutation,
  useTaskBoardQuery,
} from "../queries/idq-task-query";
import { useTaskSettings } from "../hooks/use-task-settings";
import { useAddPageToTree } from "@/idq/core/space-tree";
import { IBoardTask, ITaskBoard, TaskStatus } from "../types";
import {
  compareTasks,
  newTaskContent,
  statusColor,
  statusName,
} from "../task-display";
import { TaskColumn } from "../components/task-column";
import {
  NO_FILTERS,
  TaskFilters,
  TaskFiltersBar,
  applyFilters,
  hasFilters,
} from "../components/task-filters";
import { BoardSettingsModal } from "../components/board-settings-modal";
import classes from "../components/task-board.module.css";
import "../i18n";

export default function IdqTaskBoardPage() {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const space = useGetSpaceBySlugQuery(spaceSlug);
  const board = useTaskBoardQuery(space.data?.id);
  const settings = useTaskSettings();

  if (space.isError || board.isError || settings.isError) {
    return (
      <EmptyState
        icon={IconLayoutKanban}
        title={t("Failed to load the board")}
        description={t(
          "The space may not exist, or you may not have access to it.",
        )}
      />
    );
  }

  if (!space.data || !board.data || settings.isLoading) {
    return (
      <Group justify="center" mt="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  return <Board board={board.data} />;
}

function Board({ board }: { board: ITaskBoard }) {
  const { t } = useTranslation();
  const { id: spaceId, name: spaceName } = board.space;
  const { statuses, priorities } = useTaskSettings();
  const currentUser = useAtomValue(userAtom);
  const { isAdmin } = useUserRole();

  const setStatus = useSetTaskStatusMutation(spaceId);
  const createTask = useCreateTaskMutation(spaceId);
  const addPageToTree = useAddPageToTree();

  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const [dragged, setDragged] = useState<IBoardTask | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [settingsOpened, settingsModal] = useDisclosure(false);

  const tasks = board.tasks;
  const visibleTasks = useMemo(
    () => applyFilters(tasks, filters, currentUser?.id),
    [tasks, filters, currentUser?.id],
  );

  const columns = useMemo(() => {
    const byStatus = new Map<TaskStatus | null, IBoardTask[]>();
    for (const task of visibleTasks) {
      const list = byStatus.get(task.status) ?? [];
      list.push(task);
      byStatus.set(task.status, list);
    }
    const compare = compareTasks(priorities);
    byStatus.forEach((list) => list.sort(compare));
    return byStatus;
  }, [visibleTasks, priorities]);

  const hasUnknownStatus = tasks.some((task) => task.status === null);

  const moveTask = (task: IBoardTask, status: TaskStatus) => {
    setDragged(null);
    if (task.status === status) return;
    setStatus.mutate({ pageId: task.pageId, status });
    setAnnouncement(
      t("{{title}} moved to {{status}}", {
        title: task.title || t("Untitled"),
        status: statusName(status, t),
      }),
    );
  };

  const create = async (title: string, status: TaskStatus) => {
    const { page } = await createTask.mutateAsync({
      title,
      status,
      content: newTaskContent(t),
    });
    addPageToTree(page);
  };

  const columnProps = {
    spaceSlug: board.space.slug,
    draggedTask: dragged,
    onDragStart: setDragged,
    onDragEnd: () => setDragged(null),
    onMove: moveTask,
  };

  return (
    <Stack gap="md" px="md" pt="md">
      <DocumentTitle title={`${t("Board")} · ${spaceName}`} />

      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div>
          <Title order={2}>{t("Board")}</Title>
          <Text size="sm" c="dimmed">
            {t("Tasks of {{space}}", { space: spaceName })}
          </Text>
        </div>
        <Group gap="sm" wrap="wrap">
          <TaskFiltersBar
            tasks={tasks}
            filters={filters}
            onChange={setFilters}
          />
          {isAdmin && (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconSettings size={14} />}
              onClick={settingsModal.open}
            >
              {t("Board settings")}
            </Button>
          )}
        </Group>
      </Group>

      {tasks.length === 0 && (
        <Alert icon={<IconInfoCircle />} variant="light" color="gray">
          {board.canCreate
            ? t(
                "No tasks yet. Create one in a column, or add a status label to an existing page.",
              )
            : t("There are no tasks in this space yet.")}
        </Alert>
      )}

      {tasks.length > 0 && hasFilters(filters) && visibleTasks.length === 0 && (
        <Text size="sm" c="dimmed">
          {t("No tasks match the filters.")}
        </Text>
      )}

      <div className={classes.board}>
        {statuses.map((status) => (
          <TaskColumn
            key={status}
            title={statusName(status, t)}
            color={statusColor(status)}
            status={status}
            tasks={columns.get(status) ?? []}
            canCreate={board.canCreate}
            onCreate={create}
            {...columnProps}
          />
        ))}

        {hasUnknownStatus && (
          <TaskColumn
            title={t("Other status")}
            color="gray"
            status={null}
            tasks={columns.get(null) ?? []}
            canCreate={false}
            {...columnProps}
          />
        )}
      </div>

      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>

      {isAdmin && (
        <BoardSettingsModal
          spaceId={spaceId}
          opened={settingsOpened}
          onClose={settingsModal.close}
        />
      )}
    </Stack>
  );
}
