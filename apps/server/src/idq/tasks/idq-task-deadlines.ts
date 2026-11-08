export type TaskDeadline = {
  dueAt: Date;
  allDay: boolean;
  title: string | null;
};

/**
 * Extension point for deadlines (issue #12). The board doesn't know how
 * deadlines are stored: the deadlines feature registers a provider for this
 * token in IdqModule, e.g.
 *
 *   { provide: IDQ_TASK_DEADLINE_SOURCE, useExisting: IdqDeadlinesService }
 *
 * Without a provider the cards simply show no deadline.
 */
export const IDQ_TASK_DEADLINE_SOURCE = Symbol('IDQ_TASK_DEADLINE_SOURCE');

export interface IdqTaskDeadlineSource {
  /**
   * The next open deadline of each page, overdue ones included. Pages
   * without one are left out. The caller has checked access to the pages.
   */
  nextOpenDeadlines(pageIds: string[]): Promise<Map<string, TaskDeadline>>;
}
