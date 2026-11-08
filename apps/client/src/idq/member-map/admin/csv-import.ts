// Reading a list of members (CSV, as Excel saves it) for the map management
// page. It runs in the admin's browser: only email, province and visibility
// of the matched members are sent to the server, never other columns such as
// addresses.
import { PROVINCES } from "../geo/italy-grid";
import { IAdminMember, MemberVisibility } from "../types";

/** Parses CSV as Excel writes it: "," or ";" (Italian Excel), quotes, BOM. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delimiter = count(";") > count(",") ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows
    .map((r) => r.map((f) => f.trim()))
    .filter((r) => r.some((f) => f !== ""));
}

/** Lowercase, without accents and punctuation: "Forlì-Cesena" → "forli cesena". */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// How people often write a province, besides its ISTAT name and abbreviation.
const PROVINCE_ALIASES: Record<string, string> = {
  "reggio emilia": "RE",
  "reggio calabria": "RC",
  monza: "MB",
  "monza brianza": "MB",
  brianza: "MB",
  pesaro: "PU",
  urbino: "PU",
  massa: "MS",
  carrara: "MS",
  barletta: "BT",
  andria: "BT",
  trani: "BT",
  forli: "FC",
  cesena: "FC",
  verbania: "VB",
  bozen: "BZ",
  "bolzano bozen": "BZ",
  "valle d aosta": "AO",
  spezia: "SP",
};

const PROVINCE_BY_KEY = new Map<string, string>([
  ...PROVINCES.map((p) => [normalize(p.name), p.code] as const),
  ...Object.entries(PROVINCE_ALIASES),
]);
const PROVINCE_CODES = new Set(PROVINCES.map((p) => p.code));

/** A province from its abbreviation ("bo") or name ("Bologna"); null if unknown. */
export function resolveProvince(value: string): string | null {
  const code = value.trim().toUpperCase();
  if (PROVINCE_CODES.has(code)) return code;
  return PROVINCE_BY_KEY.get(normalize(value)) ?? null;
}

type OnMap = Exclude<MemberVisibility, "hidden">;

const VISIBILITY_WORDS: Record<string, OnMap> = {
  named: "named",
  nome: "named",
  "con nome": "named",
  "mostra il mio nome": "named",
  count: "count",
  conta: "count",
  anonimo: "count",
  "senza nome": "count",
  "contami senza nome": "count",
};

/** "con nome" / "senza nome" (or named / count); empty → `fallback`; null if unknown. */
export function resolveVisibility(
  value: string | undefined,
  fallback: OnMap,
): OnMap | null {
  if (!value || !value.trim()) return fallback;
  return VISIBILITY_WORDS[normalize(value)] ?? null;
}

export type ImportRow = {
  /** Line in the file, for the report. */
  line: number;
  email: string;
  province: string;
  visibility?: string;
};

const HEADERS = {
  email: ["email", "e mail", "mail", "indirizzo email"],
  province: ["provincia", "province", "sigla", "prov"],
  visibility: ["visibilita", "visibility", "nome sulla mappa", "mappa"],
};

export class ImportFileError extends Error {}

/** Rows of the file, by header: email, provincia, and optionally visibilità. */
export function readImportRows(text: string): ImportRow[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new ImportFileError("empty");
  const column = (names: string[]) =>
    header.findIndex((h) => names.includes(normalize(h)));
  const email = column(HEADERS.email);
  const province = column(HEADERS.province);
  const visibility = column(HEADERS.visibility);
  if (email < 0 || province < 0) throw new ImportFileError("columns");
  return rows.map((row, i) => ({
    line: i + 2,
    email: (row[email] ?? "").toLowerCase(),
    province: row[province] ?? "",
    visibility: visibility >= 0 ? row[visibility] : undefined,
  }));
}

export type ImportSkipReason =
  | "no-email"
  | "repeated"
  | "no-account"
  | "chosen-by-member"
  | "unknown-province"
  | "unknown-visibility";

export type ImportChange = {
  line: number;
  member: IAdminMember;
  provinceCode: string;
  visibility: OnMap;
};

export type ImportSkip = {
  line: number;
  email: string;
  reason: ImportSkipReason;
  value?: string;
};

export type ImportPlan = { changes: ImportChange[]; skips: ImportSkip[] };

/**
 * Matches the rows to the workspace members. Members who chose in their
 * profile are left as they are; the server checks it again when saving.
 */
export function planImport(
  rows: readonly ImportRow[],
  members: readonly IAdminMember[],
  defaultVisibility: OnMap,
): ImportPlan {
  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));
  const seen = new Set<string>();
  const changes: ImportChange[] = [];
  const skips: ImportSkip[] = [];

  for (const row of rows) {
    const skip = (reason: ImportSkipReason, value?: string) =>
      skips.push({ line: row.line, email: row.email, reason, value });
    const member = byEmail.get(row.email);
    const provinceCode = resolveProvince(row.province);
    const visibility = resolveVisibility(row.visibility, defaultVisibility);

    if (!row.email) skip("no-email");
    else if (seen.has(row.email)) skip("repeated");
    else if (!member) skip("no-account");
    else if (member.chosenBy === "member") skip("chosen-by-member");
    else if (!provinceCode) skip("unknown-province", row.province);
    else if (!visibility) skip("unknown-visibility", row.visibility);
    else changes.push({ line: row.line, member, provinceCode, visibility });

    if (row.email) seen.add(row.email);
  }
  return { changes, skips };
}
