import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { IdqKyselyDB } from '../database/idq-db.types';

const MAX_LOGGED_STRING = 500;

/** Shortens long strings (page and comment content) before storing them. */
export function summarizeArguments(args: unknown): unknown {
  if (typeof args === 'string') {
    return args.length > MAX_LOGGED_STRING
      ? `${args.slice(0, MAX_LOGGED_STRING)}… (${args.length} chars)`
      : args;
  }
  if (Array.isArray(args)) return args.map(summarizeArguments);
  if (args && typeof args === 'object') {
    return Object.fromEntries(
      Object.entries(args).map(([k, v]) => [k, summarizeArguments(v)]),
    );
  }
  return args;
}

/**
 * Log of the write operations done through MCP (table idq_mcp_write_log).
 * Arguments are stored as a JSON object with the tools' own keys (page_id,
 * space_id…): read them with SQL, since Kysely's camelCase plugin would
 * rename those keys.
 */
@Injectable()
export class IdqMcpWriteLogService {
  private readonly logger = new Logger('IdqMcpWriteLog');

  constructor(@InjectKysely() private readonly db: IdqKyselyDB) {}

  async log(entry: {
    workspaceId: string;
    userId: string;
    apiKeyId: string;
    tool: string;
    args: unknown;
    success: boolean;
    error?: string;
  }): Promise<void> {
    try {
      await this.db
        .insertInto('idqMcpWriteLog')
        .values({
          workspaceId: entry.workspaceId,
          userId: entry.userId,
          apiKeyId: entry.apiKeyId,
          tool: entry.tool,
          // An object: postgres.js serializes jsonb parameters itself, and
          // a JSON string would be stored as a string.
          arguments: summarizeArguments(entry.args ?? {}),
          success: entry.success,
          error: entry.error ?? null,
        })
        .execute();
    } catch (err) {
      this.logger.error(
        `Failed to write MCP log for ${entry.tool}: ${(err as Error).message}`,
      );
    }
  }
}
