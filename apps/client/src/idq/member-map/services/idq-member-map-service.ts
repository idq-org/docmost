import { api } from "@/idq/core/docmost";
import {
  IAdminMember,
  IAdminMemberUpdate,
  IAdminUpdateResult,
  IMemberLocation,
  IMemberLocationUpdate,
  IMemberMap,
} from "../types";
import { saveInBatches } from "./save-in-batches";

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
  location: IMemberLocationUpdate,
): Promise<IMemberLocation> {
  return post<IMemberLocation>("/me/update", location);
}

export function getAdminMembers(): Promise<IAdminMember[]> {
  return post<IAdminMember[]>("/admin/members");
}

/** Large saves (e.g. a long CSV) go in batches: the server takes 1000 at most. */
export function updateMembersAsAdmin(
  members: IAdminMemberUpdate[],
): Promise<IAdminUpdateResult> {
  return saveInBatches(members, (batch) =>
    post<IAdminUpdateResult>("/admin/update", { members: batch }),
  );
}
