import { useCallback } from "react";
import { useStore } from "jotai";
import {
  SpaceTreeNode,
  invalidateOnCreatePage,
  spaceRoots,
  treeDataAtom,
  treeModel,
  updateSpaceRoots,
  useQueryEmit,
} from "./docmost";

/** A page created outside the sidebar, as the space tree needs it. */
export type NewTreePage = {
  id: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  position: string;
  parentPageId: string | null;
  spaceId: string;
};

export function toTreeNode(page: NewTreePage): SpaceTreeNode {
  return {
    id: page.id,
    slugId: page.slugId,
    name: page.title ?? "",
    icon: page.icon ?? undefined,
    position: page.position,
    spaceId: page.spaceId,
    parentPageId: page.parentPageId,
    hasChildren: false,
    children: [],
  };
}

/**
 * Adds a new page as the last child of its parent (or the last root page of
 * its space) in the sidebar tree, which can hold the roots of several spaces.
 * Returns the tree unchanged, and no index, when the page is already there or
 * when its parent isn't loaded: a parent that isn't in the tree, or whose
 * children aren't loaded yet, loads them all (this page included) when it is
 * expanded, and one child inserted now would stop that.
 */
export function insertNewPage(
  tree: SpaceTreeNode[],
  page: NewTreePage,
): { tree: SpaceTreeNode[]; index?: number } {
  if (treeModel.find(tree, page.id)) return { tree };
  const parentId = page.parentPageId ?? null;
  const roots = spaceRoots(tree, page.spaceId);
  let index: number;
  if (parentId) {
    const parent = treeModel.find(roots, parentId) as SpaceTreeNode | null;
    if (!parent || (parent.hasChildren && !parent.children?.length)) {
      return { tree };
    }
    index = parent.children?.length ?? 0;
  } else {
    index = roots.length;
  }
  const next = updateSpaceRoots(tree, page.spaceId, (current) => {
    const inserted = treeModel.insert(
      current,
      parentId,
      toTreeNode(page),
      index,
    );
    return parentId
      ? treeModel.update(inserted, parentId, {
          hasChildren: true,
        } as Partial<SpaceTreeNode>)
      : inserted;
  });
  return { tree: next, index };
}

/**
 * Shows a page created outside the sidebar in the space tree, here and for
 * the other users, the way Docmost's sidebar does when it creates a page:
 * update the sidebar caches, insert the node under its parent, broadcast it.
 */
export function useAddPageToTree() {
  const store = useStore();
  const emit = useQueryEmit();

  return useCallback(
    (page: NewTreePage) => {
      invalidateOnCreatePage({ ...page, hasChildren: false });

      // Read the latest tree at call time, as Docmost's handleCreate does.
      const { tree, index } = insertNewPage(store.get(treeDataAtom), page);
      store.set(treeDataAtom, tree);

      // Same delay as Docmost, after the local tree has updated. Without an
      // index (parent not loaded here) receivers append the page, which is
      // where it was created.
      setTimeout(() => {
        emit({
          operation: "addTreeNode",
          spaceId: page.spaceId,
          payload: {
            parentId: page.parentPageId ?? null,
            index,
            data: toTreeNode(page),
          },
        });
      }, 50);
    },
    [store, emit],
  );
}
