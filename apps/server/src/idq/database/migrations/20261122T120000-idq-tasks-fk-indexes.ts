import { type Kysely } from 'kysely';

// Task board (issue #3): indexes on the foreign keys of the task tables
// that no other index starts with, so that deleting a workspace, an
// attachment or a user doesn't scan these tables.

export async function up(db: Kysely<any>): Promise<void> {
  // Cascade when a workspace is deleted
  await db.schema
    .createIndex('idq_task_links_workspace_idx')
    .ifNotExists()
    .on('idq_task_links')
    .column('workspace_id')
    .execute();

  // Cascade when an attachment is deleted (the unique index starts with
  // task_page_id)
  await db.schema
    .createIndex('idq_task_links_attachment_idx')
    .ifNotExists()
    .on('idq_task_links')
    .column('attachment_id')
    .where('attachment_id', 'is not', null)
    .execute();

  // Set to null when a user is deleted
  await db.schema
    .createIndex('idq_task_links_created_by_idx')
    .ifNotExists()
    .on('idq_task_links')
    .column('created_by_id')
    .where('created_by_id', 'is not', null)
    .execute();

  // Cascade when a user is deleted (the primary key starts with
  // workspace_id)
  await db.schema
    .createIndex('idq_task_assignees_user_idx')
    .ifNotExists()
    .on('idq_task_assignees')
    .column('user_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idq_task_assignees_user_idx').ifExists().execute();
  await db.schema
    .dropIndex('idq_task_links_created_by_idx')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('idq_task_links_attachment_idx')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('idq_task_links_workspace_idx')
    .ifExists()
    .execute();
}
