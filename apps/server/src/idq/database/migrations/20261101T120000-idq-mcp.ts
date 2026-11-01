import { type Kysely, sql } from 'kysely';

// IDQ MCP tables. IDQ migrations have their own tracking table
// (idq_kysely_migration), so they never mix with Docmost's.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('idq_api_keys')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(100)', (col) => col.notNull())
    // sha256 of the key: the clear-text key is never stored
    .addColumn('key_hash', 'varchar(64)', (col) => col.notNull().unique())
    // first characters of the key, to recognize it in the list
    .addColumn('key_hint', 'varchar(20)', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz')
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idq_api_keys_user_idx')
    .on('idq_api_keys')
    .columns(['workspace_id', 'user_id'])
    .execute();

  await db.schema
    .createTable('idq_workspace_settings')
    .addColumn('workspace_id', 'uuid', (col) =>
      col.primaryKey().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('idq_mcp_enabled', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('idq_mcp_write_log')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('api_key_id', 'uuid', (col) =>
      col.references('idq_api_keys.id').onDelete('set null'),
    )
    .addColumn('tool', 'varchar(64)', (col) => col.notNull())
    .addColumn('arguments', 'jsonb')
    .addColumn('success', 'boolean', (col) => col.notNull())
    .addColumn('error', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idq_mcp_write_log_workspace_idx')
    .on('idq_mcp_write_log')
    .columns(['workspace_id', 'created_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('idq_mcp_write_log').execute();
  await db.schema.dropTable('idq_workspace_settings').execute();
  await db.schema.dropTable('idq_api_keys').execute();
}
