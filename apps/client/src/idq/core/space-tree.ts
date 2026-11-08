import { useCallback } from "react";
import { useSetAtom } from "jotai";
import {
  SpaceTreeNode,
  invalidateOnCreatePage,
  treeDataAtom,
  treeModel,
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

/**
 * Shows a page created outside the sidebar in the space tree, here and for
 * the other users, the way Docmost does when it restores a page: update the
 * sidebar caches, insert the node under its parent, broadcast it.
 */
export function useAddPageToTree() {
  const setTreeData = useSetAtom(treeDataAtom);
  const emit = useQueryEmit();

  return useCallback(
    (page: NewTreePage) => {
      invalidateOnCreatePage({ ...page, hasChildren: false });

      const node: SpaceTreeNode = {
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
      const parentId = page.parentPageId ?? null;
      let index = 0;

      setTreeData((tree) => {
        if (treeModel.find(tree, page.id)) return tree;
        const parent = parentId
          ? (treeModel.find(tree, parentId) as SpaceTreeNode | null)
          : null;
        // A parent that isn't in the tree, or whose children aren't loaded
        // yet, loads them all (this page included) when it is expanded: one
        // child inserted now would stop that.
        if (
          parentId &&
          (!parent || (parent.hasChildren && !parent.children?.length))
        ) {
          return tree;
        }
        index = parent ? (parent.children?.length ?? 0) : tree.length;
        const next = treeModel.insert(tree, parentId, node, index);
        return parent
          ? treeModel.update(next, parent.id, {
              hasChildren: true,
            } as Partial<SpaceTreeNode>)
          : next;
      });

      // Same delay as Docmost, after the local tree has updated.
      setTimeout(() => {
        emit({
          operation: "addTreeNode",
          spaceId: page.spaceId,
          payload: { parentId, index, data: node },
        });
      }, 50);
    },
    [setTreeData, emit],
  );
}
