import { IDQ_PROVINCES } from './idq-provinces';

/** What a member chooses in their profile. `hidden` means no row at all. */
export const MEMBER_VISIBILITIES = ['hidden', 'count', 'named'] as const;
export type MemberVisibility = (typeof MEMBER_VISIBILITIES)[number];

export const PROVINCE_CODES: readonly string[] = IDQ_PROVINCES.map(
  (p) => p.code,
);
const REGION_OF = new Map(IDQ_PROVINCES.map((p) => [p.code, p.region]));

export function isProvinceCode(code: unknown): code is string {
  return typeof code === 'string' && REGION_OF.has(code);
}

export type MemberLocation = {
  provinceCode: string | null;
  visibility: MemberVisibility;
  /** The admin who put the member on the map; null if the member chose. */
  setBy: { id: string; name: string | null } | null;
};

export const NOT_ON_MAP: MemberLocation = {
  provinceCode: null,
  visibility: 'hidden',
  setBy: null,
};

/**
 * A workspace member, as admins see them in the map management page. What a
 * member chose in their profile is theirs: admins only learn that they chose
 * (chosenBy "member"), not their province or visibility, which stay null.
 */
export type AdminMemberRow = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  provinceCode: string | null;
  visibility: MemberVisibility | null;
  /** member: chosen in the profile; admin: set by an admin; null: not on the map */
  chosenBy: 'member' | 'admin' | null;
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
