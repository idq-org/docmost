import { describe, expect, it } from "vitest";
import {
  buildMapLayers,
  clusterMarkers,
  codeAt,
  COLS,
  DOT_RADIUS,
  memberLevel,
  PROVINCE_BY_CODE,
  ROWS,
} from "./map-geometry";
import { PROVINCES } from "./geo/italy-grid";

function squaresOf(path: string): Set<string> {
  const cells = new Set<string>();
  for (const [, x, y, w] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(w); i++) cells.add(`${Number(x) + i},${y}`);
  }
  return cells;
}

function dotsOf(path: string, r: number): Set<string> {
  const cells = new Set<string>();
  for (const [, x, y] of path.matchAll(/M([\d.]+) ([\d.]+)a/g)) {
    cells.add(`${Math.round(Number(x) + r - 0.5)},${Number(y) - 0.5}`);
  }
  return cells;
}

function landPixels(): number {
  let land = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (codeAt(x, y)) land++;
  }
  return land;
}

describe("buildMapLayers", () => {
  const layers = buildMapLayers();

  it("covers every province with exactly its pixels", () => {
    expect(layers.areas.size).toBe(PROVINCES.length);
    let total = 0;
    for (const [code, path] of layers.areas) {
      const cells = squaresOf(path);
      total += cells.size;
      for (const cell of cells) {
        const [x, y] = cell.split(",").map(Number);
        expect(codeAt(x, y)).toBe(code);
      }
    }
    expect(total).toBe(landPixels());
  });

  it("draws one dot per pixel, in the same pixels", () => {
    for (const [code, path] of layers.dots) {
      expect(dotsOf(path, DOT_RADIUS)).toEqual(
        squaresOf(layers.areas.get(code)!),
      );
    }
  });
});

describe("memberLevel", () => {
  it("has fixed steps", () => {
    expect([0, 1, 2, 4, 5, 30].map(memberLevel)).toEqual([0, 1, 2, 2, 3, 3]);
  });
});

describe("clusterMarkers", () => {
  const anchor = (code: string) => PROVINCE_BY_CODE.get(code)!.anchor;

  it("keeps far provinces apart", () => {
    const clusters = clusterMarkers(
      [
        { code: "TO", members: 1 },
        { code: "PA", members: 2 },
      ],
      { width: 2, height: 2 },
    );
    expect(clusters.map((c) => c.codes)).toEqual([["TO"], ["PA"]]);
    expect(clusters[0].anchor).toEqual(anchor("TO"));
  });

  it("merges overlapping markers on the biggest province", () => {
    const clusters = clusterMarkers(
      [
        { code: "MB", members: 1 },
        { code: "MI", members: 4 },
        { code: "PA", members: 2 },
      ],
      { width: 4, height: 4 },
    );
    const milano = clusters.find((c) => c.codes.includes("MI"))!;
    expect(milano).toEqual({
      id: "MI",
      codes: ["MI", "MB"],
      members: 5,
      anchor: anchor("MI"),
    });
    expect(clusters).toHaveLength(2);
  });

  it("merges more as the map gets smaller", () => {
    const romagna = [
      { code: "FC", members: 5 },
      { code: "RN", members: 3 },
      { code: "RA", members: 2 },
      { code: "BO", members: 4 },
    ];
    const big = clusterMarkers(romagna, { width: 1, height: 1 });
    const small = clusterMarkers(romagna, { width: 8, height: 8 });
    expect(big).toHaveLength(4);
    expect(small.length).toBeLessThan(big.length);
    expect(small.reduce((sum, c) => sum + c.members, 0)).toBe(14);
  });

  it("ignores unknown codes and empty provinces", () => {
    expect(
      clusterMarkers(
        [
          { code: "ZZ", members: 3 },
          { code: "BO", members: 0 },
        ],
        { width: 2, height: 2 },
      ),
    ).toEqual([]);
  });
});
