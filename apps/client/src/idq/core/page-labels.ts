import { useEffect, useRef } from "react";
import {
  hashKey,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { ILabel, IPagination } from "./docmost";

/** Key of Docmost's cache of a page's labels (usePageLabelsQuery). */
export const pageLabelsKey = (pageId: string) => ["page-labels", pageId];

/**
 * Refreshes Docmost's label views after IDQ changed the labels of a page:
 * the labels section of the page, and the caches Docmost's own label
 * mutations refresh too (the workspace's labels, the pages of a label and
 * its details).
 */
export function invalidatePageLabels(queryClient: QueryClient, pageId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: pageLabelsKey(pageId) }),
    queryClient.invalidateQueries({ queryKey: ["workspace-labels"] }),
    queryClient.invalidateQueries({ queryKey: ["label-pages"] }),
    queryClient.invalidateQueries({ queryKey: ["label-info"] }),
  ]);
}

/**
 * Calls onChange when the labels of the page change in Docmost's labels
 * section. Only real changes count, not the first load of the labels.
 */
export function usePageLabelsChange(pageId: string, onChange: () => void) {
  const queryClient = useQueryClient();
  const lastNames = useRef<string | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    const labelsHash = hashKey(pageLabelsKey(pageId));
    lastNames.current = null;

    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.query.queryHash !== labelsHash) {
        return;
      }
      const data = event.query.state.data as IPagination<ILabel> | undefined;
      if (!data) return;
      const names = data.items
        .map((label) => label.name)
        .sort()
        .join("\n");
      if (lastNames.current !== null && lastNames.current !== names) {
        callback.current();
      }
      lastNames.current = names;
    });
  }, [pageId, queryClient]);
}
