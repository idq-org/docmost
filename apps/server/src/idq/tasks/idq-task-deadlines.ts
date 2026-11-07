import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

export type TaskDeadline = {
  dueAt: Date;
  allDay: boolean;
  title: string | null;
};

const TABLE_CHECK_TTL_MS = 60 * 1000;

/**
 * Next open deadline of each task, for the cards. Deadlines belong to issue
 * #12 (table `idq_deadlines`): until that table exists the board simply shows
 * no deadlines, so the two features can be released in any order.
 */
@Injectable()
export class IdqTaskDeadlines {
  private tableCheckedAt = 0;
  private tableExists = false;

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async nextOpenDeadlines(
    pageIds: string[],
  ): Promise<Map<string, TaskDeadline>> {
    const result = new Map<string, TaskDeadline>();
    if (pageIds.length === 0 || !(await this.hasDeadlinesTable())) {
      return result;
    }

    // Columns as specified in issue #12.
    const { rows } = await sql<{
      pageId: string;
      dueAt: Date;
      allDay: boolean;
      title: string | null;
    }>`
      select distinct on (page_id)
        page_id as "pageId", due_at as "dueAt", all_day as "allDay", title
      from idq_deadlines
      where page_id = any(${pageIds}::uuid[]) and status = 'open'
      order by page_id, due_at asc
    `.execute(this.db);

    for (const row of rows) {
      result.set(row.pageId, {
        dueAt: row.dueAt,
        allDay: Boolean(row.allDay),
        title: row.title ?? null,
      });
    }
    return result;
  }

  private async hasDeadlinesTable(): Promise<boolean> {
    const now = Date.now();
    if (this.tableExists || now - this.tableCheckedAt < TABLE_CHECK_TTL_MS) {
      return this.tableExists;
    }
    const { rows } = await sql<{
      table: string | null;
    }>`select to_regclass('idq_deadlines')::text as table`.execute(this.db);
    this.tableExists = Boolean(rows[0]?.table);
    this.tableCheckedAt = now;
    return this.tableExists;
  }
}
