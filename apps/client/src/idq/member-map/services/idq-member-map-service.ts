import { api } from "@/idq/core/docmost";
import {
  IAdminMember,
  IAdminMemberUpdate,
  IAdminUpdateResult,
  IMemberLocation,
  IMemberMap,
} from "../types";

async function post<T>(path: string, body?: object): Promise<T> {
  const req = await api.post<T>(`/idq/member-map${path}`, body);
  return req.data;
}

export function getMemberMap(): Promise<IMemberMap> {
  return post<IMemberMap>("");
}

export function getMyLocation(): Promise<IMemberLocation> {
  return post<IMemberLocation>("/me");
}

export function setMyLocation(
  location: IMemberLocation,
): Promise<IMemberLocation> {
  return post<IMemberLocation>("/me/update", location);
}

export function getAdminMembers(): Promise<IAdminMember[]> {
  return post<IAdminMember[]>("/admin/members");
}

export function updateMembersAsAdmin(
  members: IAdminMemberUpdate[],
): Promise<IAdminUpdateResult> {
  return post<IAdminUpdateResult>("/admin/update", { members });
}
