import { IDQ_PROVINCES } from './idq-provinces';

/** What a member chooses in their profile. */
export const MEMBER_VISIBILITIES = ['hidden', 'count', 'named'] as const;
export type MemberVisibility = (typeof MEMBER_VISIBILITIES)[number];

/**
 * Who decided where a member is on the map: the member in their profile, or
 * an admin (null: nobody yet). Whatever the member decides, "Don't show me"
 * included, admins can no longer change it.
 */
export type ChosenBy = 'member' | 'admin';

export const PROVINCE_CODES: readonly string[] = IDQ_PROVINCES.map(
  (p) => p.code,
);
const REGION_OF = new Map(IDQ_PROVINCES.map((p) => [p.code, p.region]));

export function isProvinceCode(code: unknown): code is string {
  return typeof code === 'string' && REGION_OF.has(code);
}

/** Where the current user is on the map, as they see it in their profile. */
export type MemberLocation = {
  provinceCode: string | null;
  visibility: MemberVisibility;
  chosenBy: ChosenBy | null;
  /** The admin who put the member on the map (chosenBy admin), or null. */
  setBy: { id: string; name: string | null } | null;
};

/** Nobody decided yet: not on the map, and admins may still set it. */
export const NOT_DECIDED: MemberLocation = {
  provinceCode: null,
  visibility: 'hidden',
  chosenBy: null,
  setBy: null,
};

/**
 * A workspace member, as admins see them in the map management page.
 *
 * What a member decided in their profile is theirs: admins only learn that
 * the member decided (chosenBy "member"), never which choice. "Don't show
 * me", "Count me" and "Show my name" all look the same, with province,
 * visibility, setByName and updatedAt null. The one exception is the admin's
 * own row, which they see and can change (editable).
 */
export type AdminMemberRow = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  provinceCode: string | null;
  visibility: MemberVisibility | null;
  /** member: decided in the profile; admin: set by an admin; null: nobody decided */
  chosenBy: ChosenBy | null;
  /** Whether the admin who lists the members can change this row. */
  editable: boolean;
  setByName: string | null;
  updatedAt: Date | null;
};

export type AdminUpdate = {
  userId: string;
  visibility: MemberVisibility;
  provinceCode?: string | null;
};

export type AdminUpdateResult = {
  updated: number;
  skipped: { userId: string; reason: 'not-a-member' | 'chosen-by-member' }[];
};

export type NamedMember = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
};

export type ProvinceMembers = {
  code: string;
  /** Everyone on the map in the province, named or not. */
  members: number;
  /** Only the members who chose to show their name. */
  named: NamedMember[];
};

export type MemberMap = {
  totals: { members: number; provinces: number; regions: number };
  provinces: ProvinceMembers[];
};

export type ProvinceCountRow = { provinceCode: string; members: number };
export type NamedMemberRow = NamedMember & { provinceCode: string };

/**
 * Builds the map from the counts per province and the named members. Codes
 * that are no longer in the province list are left out, so the totals always
 * match what the map shows. Provinces with the most members come first.
 */
export function summarizeMemberMap(
  counts: readonly ProvinceCountRow[],
  named: readonly NamedMemberRow[],
): MemberMap {
  const namedByProvince = new Map<string, NamedMember[]>();
  for (const { provinceCode, ...member } of named) {
    const list = namedByProvince.get(provinceCode) ?? [];
    list.push(member);
    namedByProvince.set(provinceCode, list);
  }

  const provinces = counts
    .filter((row) => isProvinceCode(row.provinceCode) && row.members > 0)
    .map((row) => ({
      code: row.provinceCode,
      members: Number(row.members),
      named: namedByProvince.get(row.provinceCode) ?? [],
    }))
    .sort((a, b) => b.members - a.members || a.code.localeCompare(b.code));

  return {
    totals: {
      members: provinces.reduce((sum, p) => sum + p.members, 0),
      provinces: provinces.length,
      regions: new Set(provinces.map((p) => REGION_OF.get(p.code))).size,
    },
    provinces,
  };
}
