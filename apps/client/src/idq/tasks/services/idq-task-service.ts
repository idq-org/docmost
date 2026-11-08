import { api } from "@/idq/core/docmost";
import {
  IAddTaskLink,
  IAssigneeMapping,
  ICreatedTask,
  IPageTaskInfo,
  ITaskBoard,
  ITaskFieldOptions,
  ITaskFieldsInput,
  ITaskLink,
  ITaskSettings,
  ITaskVocabulary,
  TaskStatus,
} from "../types";

export interface IAttachmentResult {
  id: string;
  fileName: string;
  fileExt: string;
  mimeType: string | null;
  fileSize: number | null;
  pageId: string;
  spaceId: string;
  createdAt: string;
}

async function post<T>(path: string, body?: object): Promise<T> {
  const req = await api.post<T>(`/idq/tasks${path}`, body);
  return req.data;
}

export const getTaskBoard = (spaceId: string) =>
  post<ITaskBoard>("/board", { spaceId });

export const getPageTaskInfo = (pageId: string) =>
  post<IPageTaskInfo>("/page-info", { pageId });

export const setTaskStatus = (data: { pageId: string; status: TaskStatus }) =>
  post<void>("/set-status", data);

export const setTaskFields = (data: ITaskFieldsInput) =>
  post<void>("/set-fields", data);

export const createTask = (data: {
  spaceId: string;
  title: string;
  status: TaskStatus;
  /** Markdown of the new page. */
  content?: string;
}) => post<ICreatedTask>("/create", data);

export const getTaskFieldOptions = (spaceId: string) =>
  post<ITaskFieldOptions>("/field-options", { spaceId });

export const getTaskSettings = () => post<ITaskSettings>("/settings");

export const updateTaskSettings = (vocabulary: ITaskVocabulary) =>
  post<ITaskSettings>("/settings/update", { vocabulary });

export const getAssigneeMappings = () =>
  post<IAssigneeMapping[]>("/assignees/list");

export const setAssigneeMapping = (data: {
  value: string;
  userId: string | null;
}) => post<void>("/assignees/set", data);

export const addTaskLink = (data: IAddTaskLink) =>
  post<ITaskLink>("/links/add", data);

export const removeTaskLink = (linkId: string) =>
  post<void>("/links/remove", { linkId });

export const searchTaskAttachments = (query: string) =>
  post<IAttachmentResult[]>("/attachments/search", { query });
