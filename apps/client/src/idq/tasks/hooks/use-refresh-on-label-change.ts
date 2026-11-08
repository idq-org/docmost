import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePageLabelsChange } from "@/idq/core/page-labels";
import { taskKeys } from "../queries/idq-task-query";

/**
 * Task fields are labels: when the labels of the page change in Docmost's
 * labels section, reload the task panel.
 */
export function useRefreshOnLabelChange(pageId: string) {
  const queryClient = useQueryClient();
  usePageLabelsChange(
    pageId,
    useCallback(
      () => queryClient.invalidateQueries({ queryKey: taskKeys.page(pageId) }),
      [queryClient, pageId],
    ),
  );
}
