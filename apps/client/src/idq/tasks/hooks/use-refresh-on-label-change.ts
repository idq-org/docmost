import { useEffect, useRef } from "react";
import { hashKey, useQueryClient } from "@tanstack/react-query";
import { IPagination } from "@/lib/types.ts";
import { ILabel } from "@/features/label/types/label.types.ts";
import { pageLabelsKey, taskKeys } from "../queries/idq-task-query";

/**
 * Task fields are labels: when the labels of the page change in Docmost's
 * labels section, reload the task panel. Only real changes count, not the
 * first load of the labels.
 */
export function useRefreshOnLabelChange(pageId: string) {
  const queryClient = useQueryClient();
  const lastNames = useRef<string | null>(null);

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
        queryClient.invalidateQueries({ queryKey: taskKeys.page(pageId) });
      }
      lastNames.current = names;
    });
  }, [pageId, queryClient]);
}
