#!/usr/bin/env node
// Builds the grid of Italy used by the members map (issue #4), from the
// ISTAT boundaries of the provinces ("Confini delle unità amministrative a
// fini statistici", generalized version, CC BY 4.0):
//
//   https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/2025/Limiti01012025_g.zip
//
// Usage, after unzipping the archive:
//
//   node apps/client/src/idq/member-map/geo/build-italy-grid.mjs <unzipped folder>
//
// It writes two files, which are committed:
//   - apps/client/src/idq/member-map/geo/italy-grid.json: regions, provinces
//     and the grid (one province code per pixel), for drawing the map;
//   - apps/server/src/idq/member-map/idq-provinces.ts: regions and provinces,
//     for validating codes and counting regions.
//
// No dependencies: it reads the shapefiles itself and projects with the UTM
// formulas (the ISTAT files are in WGS84 / UTM zone 32N).

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Same frame as the prototypes in idq-org/website (prototype/mappa-soci): an
// equirectangular projection, 0.12 degrees of latitude per pixel, 77 x 90
// pixels.
const PROJECTION = { lon0: 6.55, lat1: 47.15, kx: 0.751264 };
const CELL = 0.12;
const COLS = 77;
const ROWS = 90;
// Samples per side of a pixel, and the share of land samples that makes a
// pixel land: a bit under half keeps thin coasts and peninsulas.
const SAMPLES = 5;
const LAND_SHARE = 0.4;

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../../..");
const CLIENT_OUT = join(here, "italy-grid.json");
const SERVER_OUT = join(repo, "apps/server/src/idq/member-map/idq-provinces.ts");

// --- Shapefile and dBase readers ------------------------------------------

function readDbf(path) {
  const buf = readFileSync(path);
  const count = buf.readUInt32LE(4);
  const headerLength = buf.readUInt16LE(8);
  const recordLength = buf.readUInt16LE(10);
  const fields = [];
  for (let off = 32; buf[off] !== 0x0d; off += 32) {
    fields.push({
      name: buf.toString("latin1", off, off + 11).replace(/\0.*$/, ""),
      length: buf[off + 16],
    });
  }
  const records = [];
  for (let i = 0; i < count; i++) {
    let off = headerLength + i * recordLength + 1; // skip the deletion flag
    const record = {};
    for (const field of fields) {
      record[field.name] = buf
        .toString("utf8", off, off + field.length)
        .trim();
      off += field.length;
    }
    records.push(record);
  }
  return records;
}

/** Polygons of a shapefile: for each record, its rings as [x, y] arrays. */
function readShp(path) {
  const buf = readFileSync(path);
  const shapes = [];
  let off = 100;
  while (off < buf.length) {
    const contentLength = buf.readInt32BE(off + 4) * 2;
    const start = off + 8;
    const type = buf.readInt32LE(start);
    if (type !== 5 && type !== 15 && type !== 25) {
      throw new Error(`Unsupported shape type ${type}`);
    }
    const numParts = buf.readInt32LE(start + 36);
    const numPoints = buf.readInt32LE(start + 40);
    const partsAt = start + 44;
    const pointsAt = partsAt + numParts * 4;
    const parts = [];
    for (let p = 0; p < numParts; p++) parts.push(buf.readInt32LE(partsAt + p * 4));
    parts.push(numPoints);
    const rings = [];
    for (let p = 0; p < numParts; p++) {
      const ring = new Float64Array((parts[p + 1] - parts[p]) * 2);
      for (let k = parts[p], j = 0; k < parts[p + 1]; k++, j += 2) {
        ring[j] = buf.readDoubleLE(pointsAt + k * 16);
        ring[j + 1] = buf.readDoubleLE(pointsAt + k * 16 + 8);
      }
      rings.push(ring);
    }
    shapes.push(rings);
    off = start + contentLength;
  }
  return shapes;
}

function findFile(folder, pattern) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(path, pattern);
      if (found) return found;
    } else if (pattern.test(entry.name)) {
      return path;
    }
  }
  return null;
}

// --- Projection -------------------------------------------------------------

/** WGS84 latitude/longitude to UTM zone 32N metres (Snyder's series). */
function toUtm32(lat, lon) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;
  const phi = (lat * Math.PI) / 180;
  const dLambda = ((lon - 9) * Math.PI) / 180;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const N = a / Math.sqrt(1 - e2 * sin * sin);
  const T = tan * tan;
  const C = ep2 * cos * cos;
  const A = cos * dLambda;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M =
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));
  const x =
    k0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) +
    500000;
  const y =
    k0 *
    (M +
      N *
        tan *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [x, y];
}

/** Centre of a grid position (fractional pixels) in latitude/longitude. */
function gridToLatLon(x, y) {
  return [
    PROJECTION.lat1 - y * CELL,
    PROJECTION.lon0 + (x * CELL) / PROJECTION.kx,
  ];
}

// --- Geometry ---------------------------------------------------------------

function ringBox(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]);
    maxX = Math.max(maxX, ring[i]);
    minY = Math.min(minY, ring[i + 1]);
    maxY = Math.max(maxY, ring[i + 1]);
  }
  return { minX, minY, maxX, maxY };
}

function inBox(box, x, y) {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

/** Even-odd rule over all the rings, so holes (San Marino, Vatican) are out. */
function contains(shape, x, y) {
  if (!inBox(shape.box, x, y)) return false;
  let inside = false;
  for (const { ring, box } of shape.rings) {
    if (!inBox(box, x, y)) continue;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i];
      const yi = ring[i + 1];
      const xj = ring[j];
      const yj = ring[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

// --- Build --------------------------------------------------------------------

function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error("Usage: node build-italy-grid.mjs <unzipped ISTAT folder>");
    process.exit(1);
  }
  const provShp = findFile(folder, /^ProvCM.*\.shp$/i);
  const regShp = findFile(folder, /^Reg.*\.shp$/i);
  if (!provShp || !regShp) {
    throw new Error("ProvCM*.shp or Reg*.shp not found in " + folder);
  }

  const regions = readDbf(regShp.replace(/\.shp$/i, ".dbf"))
    .map((r) => ({
      code: r.COD_REG.padStart(2, "0"),
      name: r.DEN_REG,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const regionName = new Map(regions.map((r) => [r.code, r.name]));

  const records = readDbf(provShp.replace(/\.shp$/i, ".dbf"));
  const geometries = readShp(provShp);
  if (records.length !== geometries.length) {
    throw new Error("The .shp and .dbf of the provinces don't match");
  }

  const provinces = records.map((r, i) => {
    const rings = geometries[i].map((ring) => ({ ring, box: ringBox(ring) }));
    const box = rings.reduce(
      (acc, { box: b }) => ({
        minX: Math.min(acc.minX, b.minX),
        minY: Math.min(acc.minY, b.minY),
        maxX: Math.max(acc.maxX, b.maxX),
        maxY: Math.max(acc.maxY, b.maxY),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    const region = r.COD_REG.padStart(2, "0");
    if (!regionName.has(region)) throw new Error(`Unknown region ${region}`);
    if (!/^[A-Z]{2}$/.test(r.SIGLA)) throw new Error(`Bad code ${r.SIGLA}`);
    return {
      code: r.SIGLA,
      name: withAccents(r.DEN_UTS),
      region,
      shape: { rings, box },
    };
  });
  if (new Set(provinces.map((p) => p.code)).size !== provinces.length) {
    throw new Error("Duplicate province codes");
  }

  // Samples of each province in each pixel.
  const samples = Array.from({ length: ROWS * COLS }, () => new Map());
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const counts = samples[cy * COLS + cx];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const [lat, lon] = gridToLatLon(
            cx + (sx + 0.5) / SAMPLES,
            cy + (sy + 0.5) / SAMPLES,
          );
          const [x, y] = toUtm32(lat, lon);
          const hit = provinces.findIndex((p) => contains(p.shape, x, y));
          if (hit >= 0) counts.set(hit, (counts.get(hit) ?? 0) + 1);
        }
      }
    }
  }

  const grid = new Int16Array(ROWS * COLS).fill(-1);
  const threshold = LAND_SHARE * SAMPLES * SAMPLES;
  samples.forEach((counts, cell) => {
    let total = 0;
    let best = -1;
    let bestCount = 0;
    for (const [p, n] of counts) {
      total += n;
      if (n > bestCount) [best, bestCount] = [p, n];
    }
    if (total >= threshold) grid[cell] = best;
  });

  // Every province gets at least one pixel: the one where it has the most
  // samples (Trieste, Prato and Monza are smaller than a few pixels).
  provinces.forEach((province, p) => {
    if (grid.includes(p)) return;
    let bestCell = -1;
    let bestCount = 0;
    samples.forEach((counts, cell) => {
      const n = counts.get(p) ?? 0;
      if (n > bestCount && !isOnlyPixel(grid, grid[cell], cell)) {
        [bestCell, bestCount] = [cell, n];
      }
    });
    if (bestCell < 0) throw new Error(`No pixel for ${province.code}`);
    grid[bestCell] = p;
  });

  // Where the marker of each province goes: its pixel farthest from the other
  // provinces and the sea, the nearest to its centre on a tie.
  const anchors = provinces.map((_, p) => anchorOf(grid, p));

  const order = provinces
    .map((province, p) => ({ ...province, p, anchor: anchors[p] }))
    .sort(
      (a, b) =>
        a.region.localeCompare(b.region) || a.name.localeCompare(b.name, "it"),
    );

  const rows = [];
  for (let cy = 0; cy < ROWS; cy++) {
    let row = "";
    for (let cx = 0; cx < COLS; cx++) {
      const p = grid[cy * COLS + cx];
      row += p < 0 ? ".." : provinces[p].code;
    }
    rows.push(row);
  }

  writeClient(regions, order, rows);
  writeServer(regions, order);
  const pixels = provinces.map((_, p) => grid.filter((g) => g === p).length);
  console.log(
    `${provinces.length} provinces, ${regions.length} regions, ` +
      `${pixels.reduce((a, b) => a + b, 0)} land pixels ` +
      `(smallest province: ${Math.min(...pixels)} pixel)`,
  );
}

/**
 * The shapefile writes a final accented vowel as vowel + apostrophe
 * ("Forli'-Cesena"); an apostrophe before a letter is a real one
 * ("Reggio nell'Emilia").
 */
function withAccents(name) {
  const grave = { a: "à", e: "è", i: "ì", o: "ò", u: "ù" };
  return name.replace(/([aeiou])'(?![A-Za-z])/g, (_, vowel) => grave[vowel]);
}

/** True if `cell` is the only pixel of province `p` (so it can't be taken). */
function isOnlyPixel(grid, p, cell) {
  if (p < 0) return false;
  for (let i = 0; i < grid.length; i++) {
    if (i !== cell && grid[i] === p) return false;
  }
  return true;
}

function anchorOf(grid, p) {
  const cells = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === p) cells.push([i % COLS, Math.floor(i / COLS)]);
  }
  const cx = cells.reduce((s, [x]) => s + x, 0) / cells.length;
  const cy = cells.reduce((s, [, y]) => s + y, 0) / cells.length;
  const depth = ([x, y]) => {
    for (let d = 1; ; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= COLS ||
            ny >= ROWS ||
            grid[ny * COLS + nx] !== p
          ) {
            return d;
          }
        }
      }
    }
  };
  let best = cells[0];
  let bestDepth = -1;
  let bestDistance = Infinity;
  for (const cell of cells) {
    const d = depth(cell);
    const distance = Math.hypot(cell[0] - cx, cell[1] - cy);
    if (d > bestDepth || (d === bestDepth && distance < bestDistance)) {
      [best, bestDepth, bestDistance] = [cell, d, distance];
    }
  }
  // Pixel centre, in pixel units.
  return [best[0] + 0.5, best[1] + 0.5];
}

const SOURCE =
  "ISTAT, boundaries of the administrative units on 1 January 2025: " +
  "https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/2025/Limiti01012025_g.zip";
const GENERATED_BY = "apps/client/src/idq/member-map/geo/build-italy-grid.mjs";

/** The client data, as JSON: one region, province or grid row per line. */
function writeClient(regions, provinces, rows) {
  const lines = (items) => items.map((i) => `    ${JSON.stringify(i)}`).join(",\n");
  const out = `{
  "generatedBy": ${JSON.stringify(GENERATED_BY)},
  "source": ${JSON.stringify(SOURCE)},
  "license": "CC BY 4.0",
  "projection": ${JSON.stringify({ ...PROJECTION, cell: CELL })},
  "cols": ${COLS},
  "rows": ${ROWS},
  "regions": [
${lines(regions)}
  ],
  "provinces": [
${lines(provinces.map(({ code, name, region, anchor }) => ({ code, name, region, anchor })))}
  ],
  "grid": [
${lines(rows)}
  ]
}
`;
  writeFileSync(CLIENT_OUT, out);
}

/** A string literal as Prettier writes it in the server code. */
function quote(value) {
  return value.includes("'") ? JSON.stringify(value) : `'${value}'`;
}

function writeServer(regions, provinces) {
  const [sourceName, sourceUrl] = SOURCE.split(": ");
  const out = `// Generated by ${GENERATED_BY}:
// don't edit by hand, run the script again (see .github/MEMBER-MAP.md).
// Source: ${sourceName}
// (${sourceUrl}), licensed CC BY 4.0.
// Codes are the province abbreviations (sigle automobilistiche). The client
// has the same list, with the map pixels, in
// apps/client/src/idq/member-map/geo/italy-grid.json.

/** ISTAT region code → name. */
export const IDQ_REGIONS: Readonly<Record<string, string>> = {
${regions.map((r) => `  ${quote(r.code)}: ${quote(r.name)},`).join("\n")}
};

export interface IdqProvince {
  code: string;
  name: string;
  /** ISTAT region code */
  region: string;
}

export const IDQ_PROVINCES: readonly IdqProvince[] = [
${provinces
  .map(
    (p) =>
      `  { code: ${quote(p.code)}, name: ${quote(p.name)}, region: ${quote(p.region)} },`,
  )
  .join("\n")}
];
`;
  writeFileSync(SERVER_OUT, out);
}

main();
