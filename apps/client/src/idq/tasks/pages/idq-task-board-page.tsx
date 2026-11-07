import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAtomValue } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
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
  IconUsers,
} from "@tabler/icons-react";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useTranslation } from "react-i18next";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import {
  useCreateTaskMutation,
  useSetTaskStatusMutation,
  useTaskBoardQuery,
} from "../queries/idq-task-query";
import { IBoardTask, TaskStatus } from "../types";
import {
  compareTasks,
  newTaskContent,
  statusColor,
  statusName,
} from "../task-display";
import { AssigneeMappingsModal } from "../components/assignee-mappings-modal";
import { TaskColumn } from "../components/task-column";
import {
  NO_FILTERS,
  TaskFilters,
  TaskFiltersBar,
  applyFilters,
  hasFilters,
} from "../components/task-filters";
import classes from "../components/task-board.module.css";
import "../i18n";

export default function IdqTaskBoardPage() {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);
  const { data: board, isLoading, isError } = useTaskBoardQuery(space?.id);
  const currentUser = useAtomValue(userAtom);
  const { isAdmin } = useUserRole();
  const [mappingsOpened, mappings] = useDisclosure(false);
  const queryClient = useQueryClient();

  const setStatus = useSetTaskStatusMutation(space?.id);
  const createTask = useCreateTaskMutation(space?.id);

  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const [dragged, setDragged] = useState<IBoardTask | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const visibleTasks = useMemo(
    () => applyFilters(board?.tasks ?? [], filters, currentUser?.id),
    [board?.tasks, filters, currentUser?.id],
  );

  const columns = useMemo(() => {
    const byStatus = new Map<TaskStatus | null, IBoardTask[]>();
    for (const task of visibleTasks) {
      const list = byStatus.get(task.status) ?? [];
      list.push(task);
      byStatus.set(task.status, list);
    }
    byStatus.forEach((list) => list.sort(compareTasks));
    return byStatus;
  }, [visibleTasks]);

  const unknownStatusCount = (board?.tasks ?? []).filter(
    (task) => task.status === null,
  ).length;

  if (!space || isLoading) {
    return (
      <Group justify="center" mt="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  if (isError || !board) {
    return (
      <EmptyState
        icon={IconLayoutKanban}
        title={t("Failed to load the board")}
      />
    );
  }

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
    await createTask.mutateAsync({
      title,
      status,
      content: newTaskContent(t),
    });
    // Show the new page in the sidebar tree.
    queryClient.invalidateQueries({
      queryKey: ["root-sidebar-pages", space.id],
    });
  };

  return (
    <Stack gap="md" px="md" pt="md">
      <DocumentTitle title={`${t("Board")} · ${space.name}`} />

      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div>
          <Title order={2}>{t("Board")}</Title>
          <Text size="sm" c="dimmed">
            {t("Tasks of {{space}}", { space: space.name })}
          </Text>
        </div>
        <Group gap="sm" wrap="wrap">
          <TaskFiltersBar
            tasks={board.tasks}
            filters={filters}
            onChange={setFilters}
          />
          {isAdmin && (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconUsers size={14} />}
              onClick={mappings.open}
            >
              {t("People in charge")}
            </Button>
          )}
        </Group>
      </Group>

      {isAdmin && (
        <AssigneeMappingsModal
          spaceId={space.id}
          opened={mappingsOpened}
          onClose={mappings.close}
        />
      )}

      {board.tasks.length === 0 && (
        <Alert icon={<IconInfoCircle />} variant="light" color="gray">
          {board.canCreate
            ? t(
                "No tasks yet. Create one in a column, or add a label such as stato-da-fare to an existing page.",
              )
            : t("There are no tasks in this space yet.")}
        </Alert>
      )}

      {board.tasks.length > 0 &&
        hasFilters(filters) &&
        visibleTasks.length === 0 && (
          <Text size="sm" c="dimmed">
            {t("No tasks match the filters.")}
          </Text>
        )}

      <div className={classes.board}>
        {board.statuses.map((status) => (
          <TaskColumn
            key={status}
            title={statusName(status, t)}
            color={statusColor(status)}
            status={status}
            tasks={columns.get(status) ?? []}
            spaceSlug={board.space.slug}
            canCreate={board.canCreate}
            draggedTask={dragged}
            onDragStart={setDragged}
            onDragEnd={() => setDragged(null)}
            onMove={moveTask}
            onCreate={create}
          />
        ))}

        {unknownStatusCount > 0 && (
          <TaskColumn
            title={t("Other status")}
            color="gray"
            status={null}
            tasks={columns.get(null) ?? []}
            spaceSlug={board.space.slug}
            canCreate={false}
            draggedTask={dragged}
            onDragStart={setDragged}
            onDragEnd={() => setDragged(null)}
            onMove={moveTask}
          />
        )}
      </div>

      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </Stack>
  );
}
