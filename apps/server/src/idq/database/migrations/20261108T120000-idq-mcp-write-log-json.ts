import { type Kysely, sql } from 'kysely';

// The MCP write log stored its arguments as a JSON string inside the jsonb
// column (the driver serializes jsonb parameters itself, and the code passed
// an already serialized string). Turn those rows into JSON objects. Only
// strings that are valid JSON are converted, so this can't fail on odd data.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    update idq_mcp_write_log
    set arguments = (arguments #>> '{}')::jsonb
    where jsonb_typeof(arguments) = 'string'
      and pg_input_is_valid(arguments #>> '{}', 'jsonb')
  `.execute(db);
}

export async function down(): Promise<void> {
  // Nothing to undo: the objects are what the column was meant to hold.
}
