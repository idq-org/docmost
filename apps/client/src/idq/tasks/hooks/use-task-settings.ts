import { useTaskSettingsQuery } from "../queries/idq-task-query";
import { ITaskVocabulary, TaskStatus } from "../types";

const NO_STATUSES: TaskStatus[] = [];
const NO_PRIORITIES: string[] = [];

/** Columns and label vocabulary of the workspace (cached, shared). */
export function useTaskSettings(): {
  statuses: TaskStatus[];
  priorities: string[];
  vocabulary: ITaskVocabulary | undefined;
  isDefault: boolean;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useTaskSettingsQuery();
  return {
    statuses: data?.statuses ?? NO_STATUSES,
    priorities: data?.vocabulary.priorities ?? NO_PRIORITIES,
    vocabulary: data?.vocabulary,
    isDefault: data?.isDefault ?? true,
    isLoading,
    isError,
  };
}
