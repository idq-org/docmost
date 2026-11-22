import { describe, expect, it, vi } from "vitest";
import type { SpaceTreeNode } from "@/features/page/tree/types";

// Only the pure tree helpers are needed, not the rest of Docmost.
vi.mock("./docmost", async () => ({
  ...(await import("@/features/page/tree/utils/utils")),
  treeModel: (await import("@/features/page/tree/model/tree-model")).treeModel,
  treeDataAtom: {},
}));

const { insertNewPage } = await import("./space-tree");

const node = (
  id: string,
  spaceId: string,
  extra: Partial<SpaceTreeNode> = {},
): SpaceTreeNode => ({
  id,
  slugId: id,
  name: id,
  position: "a0",
  spaceId,
  parentPageId: null,
  hasChildren: false,
  children: [],
  ...extra,
});

const page = (id: string, spaceId: string, parentPageId: string | null) => ({
  id,
  slugId: id,
  title: id,
  icon: null,
  position: "z0",
  parentPageId,
  spaceId,
});

const ids = (nodes: SpaceTreeNode[]) => nodes.map((n) => n.id);

describe("insertNewPage", () => {
  // The sidebar tree can hold the root pages of several spaces
  const tree = [
    node("a1", "A"),
    node("b1", "B"),
    node("a2", "A", {
      hasChildren: true,
      children: [node("a2-1", "A", { parentPageId: "a2" })],
    }),
    node("a3", "A", { hasChildren: true, children: [] }),
  ];

  it("appends a root page after the roots of its own space", () => {
    const { tree: next, index } = insertNewPage(tree, page("a4", "A", null));
    expect(index).toBe(3);
    expect(ids(next.filter((n) => n.spaceId === "A"))).toEqual([
      "a1",
      "a2",
      "a3",
      "a4",
    ]);
    expect(ids(next.filter((n) => n.spaceId === "B"))).toEqual(["b1"]);
  });

  it("appends a child to a loaded parent", () => {
    const { tree: next, index } = insertNewPage(tree, page("a2-2", "A", "a2"));
    expect(index).toBe(1);
    const parent = next.find((n) => n.id === "a2")!;
    expect(ids(parent.children!)).toEqual(["a2-1", "a2-2"]);
  });

  it("leaves a parent whose children aren't loaded yet alone", () => {
    const { tree: next, index } = insertNewPage(tree, page("a3-1", "A", "a3"));
    expect(next).toBe(tree);
    expect(index).toBeUndefined();
  });

  it("leaves the tree alone for a parent that isn't in it, or a page already in it", () => {
    expect(insertNewPage(tree, page("x", "A", "missing")).tree).toBe(tree);
    expect(insertNewPage(tree, page("a1", "A", null)).tree).toBe(tree);
  });

  it("marks a leaf parent as having children", () => {
    const { tree: next } = insertNewPage(tree, page("a1-1", "A", "a1"));
    const parent = next.find((n) => n.id === "a1")!;
    expect(parent.hasChildren).toBe(true);
    expect(ids(parent.children!)).toEqual(["a1-1"]);
  });
});
