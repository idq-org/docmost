// Typed access to italy-grid.json, which build-italy-grid.mjs generates from
// the ISTAT boundaries (CC BY 4.0): see .github/MEMBER-MAP.md.
import data from "./italy-grid.json";

export interface Region {
  /** ISTAT code, e.g. "08" */
  code: string;
  name: string;
}

export interface Province {
  /** Abbreviation (sigla automobilistica), e.g. "BO" */
  code: string;
  name: string;
  /** ISTAT code of its region */
  region: string;
  /** Where its marker goes, in pixels from the top left of the grid. */
  anchor: readonly [number, number];
}

/** The pixels of the map: one 2-letter province code per pixel, ".." is sea. */
export const GRID: {
  cols: number;
  rows: number;
  data: readonly string[];
} = { cols: data.cols, rows: data.rows, data: data.grid };

/** From north to south (ISTAT order). */
export const REGIONS: readonly Region[] = data.regions;

/** By region, then by name. */
export const PROVINCES: readonly Province[] = data.provinces.map((p) => ({
  ...p,
  anchor: [p.anchor[0], p.anchor[1]] as const,
}));
