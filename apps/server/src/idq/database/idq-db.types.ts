import type { ColumnType, Generated, Kysely } from 'kysely';
import type { DbInterface } from '@docmost/db/types/db.interface';

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface IdqApiKeys {
  id: Generated<string>;
  workspaceId: string;
  userId: string;
  name: string;
  keyHash: string;
  keyHint: string;
  expiresAt: Timestamp | null;
  lastUsedAt: Timestamp | null;
  revokedAt: Timestamp | null;
  createdAt: Generated<Timestamp>;
}

export interface IdqWorkspaceSettings {
  workspaceId: string;
  idqMcpEnabled: Generated<boolean>;
  updatedAt: Generated<Timestamp>;
}

export interface IdqMcpWriteLog {
  id: Generated<string>;
  workspaceId: string;
  userId: string | null;
  apiKeyId: string | null;
  tool: string;
  arguments: unknown;
  success: boolean;
  error: string | null;
  createdAt: Generated<Timestamp>;
}

export interface IdqDbInterface extends DbInterface {
  idqApiKeys: IdqApiKeys;
  idqWorkspaceSettings: IdqWorkspaceSettings;
  idqMcpWriteLog: IdqMcpWriteLog;
}

export type IdqKyselyDB = Kysely<IdqDbInterface>;
