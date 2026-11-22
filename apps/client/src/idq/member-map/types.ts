/** What a member chooses in their profile. */
export type MemberVisibility = "hidden" | "count" | "named";

/** Who decided: the member in their profile, or an admin (null: nobody yet). */
export type ChosenBy = "member" | "admin";

/** What the profile sends: the member's own choice. */
export interface IMemberLocationUpdate {
  /** Province abbreviation, e.g. "BO"; null when not on the map. */
  provinceCode: string | null;
  visibility: MemberVisibility;
}

export interface IMemberLocation extends IMemberLocationUpdate {
  chosenBy: ChosenBy | null;
  /** The admin who put the member on the map (chosenBy admin), or null. */
  setBy: { id: string; name: string | null } | null;
}

/**
 * A workspace member, in the map management page (admins only). For members
 * who decided in their profile, admins only learn that they decided, never
 * which choice: province and visibility are null, whatever they chose. The
 * admin's own row is the exception (editable, with its values).
 */
export interface IAdminMember {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  provinceCode: string | null;
  visibility: MemberVisibility | null;
  /** member: decided in the profile; admin: set by an admin; null: nobody decided */
  chosenBy: ChosenBy | null;
  /** Whether the current admin can change this row. */
  editable: boolean;
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
