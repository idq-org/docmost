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
  removeTaskLink,
  setAssigneeMapping,
  setTaskFields,
  setTaskStatus,
} from "../services/idq-task-service";
import { IBoardTask, IPageTaskInfo, ITaskBoard, TaskStatus } from "../types";

export const TASK_BOARD_KEY = (spaceId: string) => ["idq-task-board", spaceId];
export const PAGE_TASK_KEY = (pageId: string) => ["idq-page-task", pageId];

function errorMessage(err: any, fallback: string) {
  return err?.response?.data?.message ?? fallback;
}

export function useTaskBoardQuery(spaceId: string | undefined) {
  return useQuery({
    queryKey: TASK_BOARD_KEY(spaceId ?? ""),
    queryFn: () => getTaskBoard(spaceId as string),
    enabled: !!spaceId,
    // Others move cards too: reload when coming back to the board.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
  });
}

export function usePageTaskQuery(pageId: string | undefined, version = "") {
  return useQuery({
    queryKey: [...PAGE_TASK_KEY(pageId ?? ""), version],
    queryFn: () => getPageTaskInfo(pageId as string),
    enabled: !!pageId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });
}

/** Moves a card, updating the board before the server answers. */
export function useSetTaskStatusMutation(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const boardKey = TASK_BOARD_KEY(spaceId ?? "");

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
      notifications.show({
        message: errorMessage(err, t("Failed to move the task")),
        color: "red",
      });
    },
    onSettled: (_data, _err, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: boardKey });
      queryClient.invalidateQueries({ queryKey: PAGE_TASK_KEY(pageId) });
      queryClient.invalidateQueries({ queryKey: ["page-labels", pageId] });
    },
  });
}

export function useCreateTaskMutation(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const boardKey = TASK_BOARD_KEY(spaceId ?? "");

  return useMutation({
    mutationFn: (data: {
      title: string;
      status: TaskStatus;
      content?: string;
    }) => createTask({ spaceId: spaceId as string, ...data }),
    onSuccess: (task: IBoardTask) => {
      queryClient.setQueryData<ITaskBoard>(boardKey, (board) =>
        board ? { ...board, tasks: [...board.tasks, task] } : board,
      );
      queryClient.invalidateQueries({ queryKey: boardKey });
    },
    onError: (err) =>
      notifications.show({
        message: errorMessage(err, t("Failed to create the task")),
        color: "red",
      }),
  });
}

function useInvalidateTaskData() {
  const queryClient = useQueryClient();
  return (pageId: string) => {
    queryClient.invalidateQueries({ queryKey: PAGE_TASK_KEY(pageId) });
    // Link counts on the cards
    queryClient.invalidateQueries({ queryKey: ["idq-task-board"] });
  };
}

export function useAddTaskLinkMutation(taskPageId: string) {
  const { t } = useTranslation();
  const invalidate = useInvalidateTaskData();
  return useMutation({
    mutationFn: addTaskLink,
    onSuccess: () => invalidate(taskPageId),
    onError: (err) =>
      notifications.show({
        message: errorMessage(err, t("Failed to link the material")),
        color: "red",
      }),
  });
}

export function useRemoveTaskLinkMutation(taskPageId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const invalidate = useInvalidateTaskData();
  return useMutation({
    mutationFn: removeTaskLink,
    onMutate: (linkId: string) => {
      // Hide it right away from every cached version of the panel.
      queryClient.setQueriesData<IPageTaskInfo>(
        { queryKey: PAGE_TASK_KEY(taskPageId) },
        (info) =>
          info
            ? { ...info, links: info.links.filter((l) => l.id !== linkId) }
            : info,
      );
    },
    onSettled: () => invalidate(taskPageId),
    onError: (err) =>
      notifications.show({
        message: errorMessage(err, t("Failed to remove the material")),
        color: "red",
      }),
  });
}

export function useTaskFieldOptionsQuery(
  spaceId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["idq-task-field-options", spaceId ?? ""],
    queryFn: () => getTaskFieldOptions(spaceId as string),
    enabled: !!spaceId && enabled,
    staleTime: 30 * 1000,
  });
}

export function useSetTaskFieldsMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: setTaskFields,
    onSuccess: (_data, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: PAGE_TASK_KEY(pageId) });
      queryClient.invalidateQueries({ queryKey: ["idq-task-board"] });
      queryClient.invalidateQueries({ queryKey: ["idq-task-field-options"] });
      queryClient.invalidateQueries({ queryKey: ["page-labels", pageId] });
    },
    onError: (err) =>
      notifications.show({
        message: errorMessage(err, t("Failed to save the task")),
        color: "red",
      }),
  });
}

const ASSIGNEE_MAPPINGS = ["idq-task-assignee-mappings"];

export function useAssigneeMappingsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ASSIGNEE_MAPPINGS,
    queryFn: getAssigneeMappings,
    enabled,
  });
}

export function useSetAssigneeMappingMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: setAssigneeMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSIGNEE_MAPPINGS });
      queryClient.invalidateQueries({ queryKey: ["idq-task-board"] });
      queryClient.invalidateQueries({ queryKey: ["idq-page-task"] });
      queryClient.invalidateQueries({ queryKey: ["idq-task-field-options"] });
    },
    onError: (err) =>
      notifications.show({
        message: errorMessage(err, t("Failed to save the person in charge")),
        color: "red",
      }),
  });
}
