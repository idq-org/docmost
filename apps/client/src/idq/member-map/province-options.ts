import { PROVINCES, REGIONS } from "./geo/italy-grid";

/** Options of a province Select, grouped by region: "Bologna (BO)". */
export const PROVINCE_OPTIONS = REGIONS.map((region) => ({
  group: region.name,
  items: PROVINCES.filter((p) => p.region === region.code).map((p) => ({
    value: p.code,
    label: `${p.name} (${p.code})`,
  })),
}));
