import { type Kysely, sql } from 'kysely';

// Task board (issue #3). A task is a Docmost page with `stato-` labels, so
// these tables only hold what labels can't: linked materials, and which user
// a `ref-` label stands for.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('idq_task_links')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    // space of the task page: lets the board count links in one query
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('task_page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    // page | attachment | url
    .addColumn('type', 'varchar(20)', (col) => col.notNull())
    .addColumn('target_page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade'),
    )
    .addColumn('attachment_id', 'uuid', (col) =>
      col.references('attachments.id').onDelete('cascade'),
    )
    .addColumn('url', 'text')
    // shown for external links; pages and attachments use their live title
    .addColumn('title', 'varchar(255)')
    .addColumn('created_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      'idq_task_links_target_check',
      sql`(type = 'page' and target_page_id is not null and attachment_id is null and url is null)
        or (type = 'attachment' and attachment_id is not null and target_page_id is null and url is null)
        or (type = 'url' and url is not null and target_page_id is null and attachment_id is null)`,
    )
    .execute();

  await db.schema
    .createIndex('idq_task_links_task_idx')
    .on('idq_task_links')
    .columns(['task_page_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idq_task_links_space_idx')
    .on('idq_task_links')
    .column('space_id')
    .execute();

  // "Used in tasks" on the linked page
  await db.schema
    .createIndex('idq_task_links_target_page_idx')
    .on('idq_task_links')
    .column('target_page_id')
    .where('target_page_id', 'is not', null)
    .execute();

  // The same page or attachment is linked to a task only once
  await db.schema
    .createIndex('idq_task_links_page_unique')
    .on('idq_task_links')
    .columns(['task_page_id', 'target_page_id'])
    .unique()
    .where('target_page_id', 'is not', null)
    .execute();

  await db.schema
    .createIndex('idq_task_links_attachment_unique')
    .on('idq_task_links')
    .columns(['task_page_id', 'attachment_id'])
    .unique()
    .where('attachment_id', 'is not', null)
    .execute();

  // `ref-andrea` → user. Labels hold names, and a first name can belong to
  // several members: admins say who each one is.
  await db.schema
    .createTable('idq_task_assignees')
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    // value of the label without `ref-`
    .addColumn('value', 'varchar(100)', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('updated_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint('idq_task_assignees_pkey', [
      'workspace_id',
      'value',
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('idq_task_assignees').execute();
  await db.schema.dropTable('idq_task_links').execute();
}
