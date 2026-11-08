import { type Kysely, sql } from 'kysely';

// Members map (issue #4). One row per member on the map: only the province,
// never a town or an address. A member who isn't on the map has no row, so
// nothing about them is stored. Members choose in their profile; an admin
// can also put on the map members who gave their consent (set_by_id).

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('idq_member_locations')
    .addColumn('user_id', 'uuid', (col) =>
      col.primaryKey().references('users.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    // province abbreviation (sigla automobilistica), e.g. "BO"
    .addColumn('province_code', 'varchar(2)', (col) => col.notNull())
    // count: only in the counts; named: with name and avatar
    .addColumn('visibility', 'varchar(10)', (col) => col.notNull())
    // null: the member chose; otherwise the admin who set it
    .addColumn('set_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      'idq_member_locations_province_check',
      sql`province_code ~ '^[A-Z]{2}$'`,
    )
    .addCheckConstraint(
      'idq_member_locations_visibility_check',
      sql`visibility in ('count', 'named')`,
    )
    .execute();

  await db.schema
    .createIndex('idq_member_locations_workspace_idx')
    .on('idq_member_locations')
    .columns(['workspace_id', 'province_code'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('idq_member_locations').execute();
}
