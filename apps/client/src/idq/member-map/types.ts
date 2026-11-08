/** What a member chooses in their profile. */
export type MemberVisibility = "hidden" | "count" | "named";

export interface IMemberLocation {
  /** Province abbreviation, e.g. "BO"; null when not on the map. */
  provinceCode: string | null;
  visibility: MemberVisibility;
  /** The admin who put the member on the map; null if the member chose. */
  setBy?: { id: string; name: string | null } | null;
}

/**
 * A workspace member, in the map management page (admins only). For members
 * who chose in their profile, admins only learn that they chose: province
 * and visibility are null.
 */
export interface IAdminMember {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  provinceCode: string | null;
  visibility: MemberVisibility | null;
  /** member: chosen in the profile; admin: set by an admin; null: not on the map */
  chosenBy: "member" | "admin" | null;
  setByName: string | null;
  updatedAt: string | null;
}

export interface IAdminMemberUpdate {
  userId: string;
  visibility: MemberVisibility;
  provinceCode: string | null;
}

export interface IAdminUpdateResult {
  updated: number;
  skipped: { userId: string; reason: "not-a-member" | "chosen-by-member" }[];
}

export interface INamedMember {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface IProvinceMembers {
  code: string;
  /** Everyone on the map in the province, named or not. */
  members: number;
  /** Only who chose to show their name. */
  named: INamedMember[];
}

export interface IMemberMap {
  totals: { members: number; provinces: number; regions: number };
  /** Only provinces with members, most members first. */
  provinces: IProvinceMembers[];
}
