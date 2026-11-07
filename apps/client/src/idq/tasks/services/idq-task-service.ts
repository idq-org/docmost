import api from "@/lib/api-client";
import {
  IAddTaskLink,
  IAssigneeMapping,
  IBoardTask,
  IPageTaskInfo,
  ITaskBoard,
  ITaskFieldOptions,
  ITaskFieldsInput,
  ITaskLink,
  TaskStatus,
} from "../types";

export async function getTaskBoard(spaceId: string): Promise<ITaskBoard> {
  const req = await api.post<ITaskBoard>("/idq/tasks/board", { spaceId });
  return req.data;
}

export async function getPageTaskInfo(pageId: string): Promise<IPageTaskInfo> {
  const req = await api.post<IPageTaskInfo>("/idq/tasks/page-info", {
    pageId,
  });
  return req.data;
}

export async function setTaskStatus(data: {
  pageId: string;
  status: TaskStatus;
}): Promise<void> {
  await api.post("/idq/tasks/set-status", data);
}

export async function createTask(data: {
  spaceId: string;
  title: string;
  status: TaskStatus;
  /** Markdown of the new page. */
  content?: string;
}): Promise<IBoardTask> {
  const req = await api.post<IBoardTask>("/idq/tasks/create", data);
  return req.data;
}

export async function addTaskLink(data: IAddTaskLink): Promise<ITaskLink> {
  const req = await api.post<ITaskLink>("/idq/tasks/links/add", data);
  return req.data;
}

export async function removeTaskLink(linkId: string): Promise<void> {
  await api.post("/idq/tasks/links/remove", { linkId });
}

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

export async function searchTaskAttachments(
  query: string,
): Promise<IAttachmentResult[]> {
  const req = await api.post<IAttachmentResult[]>(
    "/idq/tasks/attachments/search",
    { query },
  );
  return req.data;
}

export async function setTaskFields(data: ITaskFieldsInput): Promise<void> {
  await api.post("/idq/tasks/set-fields", data);
}

export async function getTaskFieldOptions(
  spaceId: string,
): Promise<ITaskFieldOptions> {
  const req = await api.post<ITaskFieldOptions>("/idq/tasks/field-options", {
    spaceId,
  });
  return req.data;
}

export async function getAssigneeMappings(): Promise<IAssigneeMapping[]> {
  const req = await api.post<IAssigneeMapping[]>("/idq/tasks/assignees/list");
  return req.data;
}

export async function setAssigneeMapping(data: {
  value: string;
  userId: string | null;
}): Promise<void> {
  await api.post("/idq/tasks/assignees/set", data);
}
