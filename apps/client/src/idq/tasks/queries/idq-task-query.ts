import { useMemo } from "react";
import {
  hashKey,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  addTaskLink,
  createTask,
  getAssigneeMappings,
  getPageTaskInfo,
  getTaskBoard,
  getTaskFieldOptions,
  getTaskSettings,
  removeTaskLink,
  setAssigneeMapping,
  setTaskFields,
  setTaskStatus,
  updateTaskSettings,
} from "../services/idq-task-service";
import { invalidatePageLabels } from "@/idq/core/page-labels";
import { IPageTaskInfo, ITaskBoard, TaskStatus } from "../types";
import { apiErrorMessage } from "@/idq/core/api-error";

export const taskKeys = {
  all: ["idq-tasks"] as const,
  settings: () => [...taskKeys.all, "settings"] as const,
  boards: () => [...taskKeys.all, "board"] as const,
  board: (spaceId: string) => [...taskKeys.boards(), spaceId] as const,
  pages: () => [...taskKeys.all, "page"] as const,
  page: (pageId: string) => [...taskKeys.pages(), pageId] as const,
  fieldOptions: () => [...taskKeys.all, "field-options"] as const,
  fieldOptionsFor: (spaceId: string) =>
    [...taskKeys.fieldOptions(), spaceId] as const,
  moves: (spaceId: string) => [...taskKeys.all, "move", spaceId] as const,
  mappings: () => [...taskKeys.all, "assignee-mappings"] as const,
};

function useErrorNotification() {
  const { t } = useTranslation();
  return (fallback: string) => (err: unknown) =>
    notifications.show({
      message: apiErrorMessage(err, t(fallback)),
      color: "red",
    });
}

export function useTaskSettingsQuery() {
  return useQuery({
    queryKey: taskKeys.settings(),
    queryFn: getTaskSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateTaskSettingsMutation() {
  const queryClient = useQueryClient();
  const onError = useErrorNotification();
  return useMutation({
    mutationFn: updateTaskSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(taskKeys.settings(), settings);
      // The same labels now mean other things: reload the rest.
      const settingsHash = hashKey(taskKeys.settings());
      queryClient.invalidateQueries({
        queryKey: taskKeys.all,
        predicate: (query) => query.queryHash !== settingsHash,
      });
    },
    onError: onError("Failed to save the settings"),
  });
}

type TaskMove = { pageId: string; status: TaskStatus };

/** The board with the cards that are being moved already in their new column. */
export function applyMoves(
  board: ITaskBoard | undefined,
  moves: TaskMove[],
): ITaskBoard | undefined {
  if (!board || moves.length === 0) return board;
  const moved = new Map(moves.map((move) => [move.pageId, move.status]));
  return {
    ...board,
    tasks: board.tasks.map((task) =>
      moved.has(task.pageId)
        ? { ...task, status: moved.get(task.pageId) as TaskStatus }
        : task,
    ),
  };
}

export function useTaskBoardQuery(spaceId: string | undefined) {
  const board = useQuery({
    queryKey: taskKeys.board(spaceId ?? ""),
    queryFn: () => getTaskBoard(spaceId as string),
    enabled: !!spaceId,
    // Others move cards too: reload when coming back to the board.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
  });
  // Moves still in progress are shown on top of the loaded board, so a
  // reload that lands meanwhile doesn't put a card back in its old column,
  // and a failed move only undoes that card.
  const moves = useMutationState({
    filters: { mutationKey: taskKeys.moves(spaceId ?? ""), status: "pending" },
    select: (mutation) => mutation.state.variables as TaskMove,
  });
  const data = useMemo(
    () => applyMoves(board.data, moves),
    [board.data, moves],
  );
  return { ...board, data };
}

export function usePageTaskQuery(pageId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.page(pageId ?? ""),
    queryFn: () => getPageTaskInfo(pageId as string),
    enabled: !!pageId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

function useInvalidateTask() {
  const queryClient = useQueryClient();
  return (pageId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: taskKeys.page(pageId) }),
      queryClient.invalidateQueries({ queryKey: taskKeys.boards() }),
      // Task fields are labels: refresh Docmost's label views too.
      invalidatePageLabels(queryClient, pageId),
    ]);
}

/** Moves a card, updating the board before the server answers. */
export function useSetTaskStatusMutation(spaceId: string | undefined) {
  const invalidate = useInvalidateTask();
  const onError = useErrorNotification();

  return useMutation({
    // useTaskBoardQuery shows the move while this mutation is pending
    mutationKey: taskKeys.moves(spaceId ?? ""),
    mutationFn: setTaskStatus,
    onError: onError("Failed to move the task"),
    // Returning the reload keeps the move pending until the board has it
    onSettled: (_data, _err, { pageId }) => invalidate(pageId),
  });
}

export function useCreateTaskMutation(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  const onError = useErrorNotification();
  const boardKey = taskKeys.board(spaceId ?? "");

  return useMutation({
    mutationFn: (data: {
      title: string;
      status: TaskStatus;
      content?: string;
    }) => createTask({ spaceId: spaceId as string, ...data }),
    onSuccess: ({ task }) => {
      queryClient.setQueryData<ITaskBoard>(boardKey, (board) =>
        board ? { ...board, tasks: [...board.tasks, task] } : board,
      );
      queryClient.invalidateQueries({ queryKey: boardKey });
    },
    onError: onError("Failed to create the task"),
  });
}

export function useSetTaskFieldsMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTask();
  const onError = useErrorNotification();
  return useMutation({
    mutationFn: setTaskFields,
    onSuccess: (_data, { pageId }) => {
      invalidate(pageId);
      queryClient.invalidateQueries({ queryKey: taskKeys.fieldOptions() });
    },
    onError: onError("Failed to save the task"),
  });
}

export function useTaskFieldOptionsQuery(
  spaceId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: taskKeys.fieldOptionsFor(spaceId ?? ""),
    queryFn: () => getTaskFieldOptions(spaceId as string),
    enabled: !!spaceId && enabled,
    staleTime: 30 * 1000,
  });
}

export function useAssigneeMappingsQuery(enabled: boolean) {
  return useQuery({
    queryKey: taskKeys.mappings(),
    queryFn: getAssigneeMappings,
    enabled,
  });
}

export function useSetAssigneeMappingMutation() {
  const queryClient = useQueryClient();
  const onError = useErrorNotification();
  return useMutation({
    mutationFn: setAssigneeMapping,
    // People in charge appear on boards, panels and pickers.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
    onError: onError("Failed to save the person in charge"),
  });
}

export function useAddTaskLinkMutation(taskPageId: string) {
  const queryClient = useQueryClient();
  const onError = useErrorNotification();
  return useMutation({
    mutationFn: addTaskLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.page(taskPageId) });
      // Link counts on the cards
      queryClient.invalidateQueries({ queryKey: taskKeys.boards() });
    },
    onError: onError("Failed to link the material"),
  });
}

export function useRemoveTaskLinkMutation(taskPageId: string) {
  const queryClient = useQueryClient();
  const onError = useErrorNotification();
  return useMutation({
    mutationFn: removeTaskLink,
    onMutate: (linkId: string) => {
      // Hide it right away.
      queryClient.setQueryData<IPageTaskInfo>(
        taskKeys.page(taskPageId),
        (info) =>
          info && {
            ...info,
            links: info.links.filter((link) => link.id !== linkId),
          },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.page(taskPageId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.boards() });
    },
    onError: onError("Failed to remove the material"),
  });
}
