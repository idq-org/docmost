import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { IPageTaskInfo, ITaskBoard, TaskStatus } from "../types";

export const taskKeys = {
  all: ["idq-tasks"] as const,
  settings: () => [...taskKeys.all, "settings"] as const,
  boards: () => [...taskKeys.all, "board"] as const,
  board: (spaceId: string) => [...taskKeys.boards(), spaceId] as const,
  pages: () => [...taskKeys.all, "page"] as const,
  page: (pageId: string) => [...taskKeys.pages(), pageId] as const,
  fieldOptions: () => [...taskKeys.all, "field-options"] as const,
  mappings: () => [...taskKeys.all, "assignee-mappings"] as const,
};

/**
 * Key of Docmost's cache of a page's labels (usePageLabelsQuery). Task
 * fields are labels, so a change made here refreshes the labels section of
 * the page, and a change made there refreshes the task panel.
 */
export const pageLabelsKey = (pageId: string) => ["page-labels", pageId];

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  return typeof message === "string" ? message : fallback;
}

function useErrorNotification() {
  const { t } = useTranslation();
  return (fallback: string) => (err: unknown) =>
    notifications.show({
      message: errorMessage(err, t(fallback)),
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
      // The same labels now mean other things.
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
    onError: onError("Failed to save the settings"),
  });
}

export function useTaskBoardQuery(spaceId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.board(spaceId ?? ""),
    queryFn: () => getTaskBoard(spaceId as string),
    enabled: !!spaceId,
    // Others move cards too: reload when coming back to the board.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
  });
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
  return (pageId: string) => {
    queryClient.invalidateQueries({ queryKey: taskKeys.page(pageId) });
    queryClient.invalidateQueries({ queryKey: taskKeys.boards() });
    queryClient.invalidateQueries({ queryKey: pageLabelsKey(pageId) });
  };
}

/** Moves a card, updating the board before the server answers. */
export function useSetTaskStatusMutation(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTask();
  const onError = useErrorNotification();
  const boardKey = taskKeys.board(spaceId ?? "");

  return useMutation({
    mutationFn: setTaskStatus,
    onMutate: async ({ pageId, status }) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      const previous = queryClient.getQueryData<ITaskBoard>(boardKey);
      if (previous) {
        queryClient.setQueryData<ITaskBoard>(boardKey, {
          ...previous,
          tasks: previous.tasks.map((task) =>
            task.pageId === pageId ? { ...task, status } : task,
          ),
        });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(boardKey, context.previous);
      }
      onError("Failed to move the task")(err);
    },
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
    queryKey: [...taskKeys.fieldOptions(), spaceId ?? ""],
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
