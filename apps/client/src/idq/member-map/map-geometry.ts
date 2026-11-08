// Geometry of the dot map: SVG paths from the province grid, and the
// markers. Everything is in grid pixels (one pixel = one SVG unit).
import { GRID, PROVINCES, REGIONS, type Province } from "./geo/italy-grid";

export const COLS = GRID.cols;
export const ROWS = GRID.rows;

/** Radius of a dot, and of the dots of a highlighted province. */
export const DOT_RADIUS = 0.34;
export const ACTIVE_DOT_RADIUS = 0.44;

export const PROVINCE_BY_CODE: ReadonlyMap<string, Province> = new Map(
  PROVINCES.map((p) => [p.code, p]),
);
export const REGION_NAME: ReadonlyMap<string, string> = new Map(
  REGIONS.map((r) => [r.code, r.name]),
);

/** Province code of a pixel, null for the sea and outside the grid. */
export function codeAt(x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
  const code = GRID.data[y].slice(x * 2, x * 2 + 2);
  return code === ".." ? null : code;
}

/** Pixels of each province, as [x, y]. */
function pixelsByProvince(): Map<string, [number, number][]> {
  const pixels = new Map<string, [number, number][]>();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const code = codeAt(x, y);
      if (!code) continue;
      const list = pixels.get(code) ?? [];
      list.push([x, y]);
      pixels.set(code, list);
    }
  }
  return pixels;
}

/** Squares, merging each horizontal run of pixels into one rectangle. */
function squaresPath(pixels: [number, number][]): string {
  const parts: string[] = [];
  for (let i = 0; i < pixels.length; ) {
    const [x, y] = pixels[i];
    let w = 1;
    while (
      i + w < pixels.length &&
      pixels[i + w][1] === y &&
      pixels[i + w][0] === x + w
    ) {
      w++;
    }
    parts.push(`M${x} ${y}h${w}v1h-${w}z`);
    i += w;
  }
  return parts.join("");
}

/** One circle per pixel, in its centre. */
function dotsPath(pixels: [number, number][], r: number): string {
  return pixels
    .map(
      ([x, y]) =>
        `M${x + 0.5 - r} ${y + 0.5}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`,
    )
    .join("");
}

export interface MapLayers {
  /** Province code → its pixels as squares: the area under the pointer. */
  areas: ReadonlyMap<string, string>;
  /** Province code → one dot per pixel. */
  dots: ReadonlyMap<string, string>;
  /** The same dots, bigger, for a highlighted province. */
  activeDots: ReadonlyMap<string, string>;
}

export function buildMapLayers(): MapLayers {
  const pixels = [...pixelsByProvince()];
  const by = (path: (p: [number, number][]) => string) =>
    new Map(pixels.map(([code, list]) => [code, path(list)]));
  return {
    areas: by(squaresPath),
    dots: by((list) => dotsPath(list, DOT_RADIUS)),
    activeDots: by((list) => dotsPath(list, ACTIVE_DOT_RADIUS)),
  };
}

/**
 * Colour level of a province: 0 with no members, then 1, 2 to 4, 5 or more.
 * Fixed steps, so the legend reads the same whatever the numbers.
 */
export type MemberLevel = 0 | 1 | 2 | 3;
export const MEMBER_LEVELS: readonly MemberLevel[] = [0, 1, 2, 3];

export function memberLevel(members: number): MemberLevel {
  if (members <= 0) return 0;
  if (members === 1) return 1;
  if (members <= 4) return 2;
  return 3;
}

export interface MarkerCluster {
  /** Code of its biggest province. */
  id: string;
  /** Biggest first. */
  codes: string[];
  members: number;
  /** Centre of the marker, in grid pixels. */
  anchor: readonly [number, number];
}

/**
 * Groups provinces whose markers would overlap into one marker, placed on
 * the biggest one. Two markers overlap when their centres are less than
 * `size.width` apart horizontally and `size.height` vertically (in grid
 * pixels, so it depends on how big the map is drawn).
 */
export function clusterMarkers(
  provinces: readonly { code: string; members: number }[],
  size: { width: number; height: number },
): MarkerCluster[] {
  const clusters: MarkerCluster[] = [];
  const sorted = provinces
    .filter((p) => p.members > 0 && PROVINCE_BY_CODE.has(p.code))
    .sort((a, b) => b.members - a.members || a.code.localeCompare(b.code));

  for (const { code, members } of sorted) {
    const [x, y] = PROVINCE_BY_CODE.get(code)!.anchor;
    const near = clusters.find(
      (c) =>
        Math.abs(c.anchor[0] - x) < size.width &&
        Math.abs(c.anchor[1] - y) < size.height,
    );
    if (near) {
      near.codes.push(code);
      near.members += members;
    } else {
      clusters.push({ id: code, codes: [code], members, anchor: [x, y] });
    }
  }
  // Southern markers in front
  return clusters.sort((a, b) => a.anchor[1] - b.anchor[1]);
}
