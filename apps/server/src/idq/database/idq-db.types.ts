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

export type IdqTaskLinkType = 'page' | 'attachment' | 'url';

export interface IdqTaskSettings {
  workspaceId: string;
  vocabulary: unknown;
  updatedById: string | null;
  updatedAt: Generated<Timestamp>;
}

export interface IdqTaskLinks {
  id: Generated<string>;
  workspaceId: string;
  taskPageId: string;
  type: IdqTaskLinkType;
  targetPageId: string | null;
  attachmentId: string | null;
  url: string | null;
  title: string | null;
  createdById: string | null;
  createdAt: Generated<Timestamp>;
}

export interface IdqTaskAssignees {
  workspaceId: string;
  value: string;
  userId: string;
  updatedById: string | null;
  updatedAt: Generated<Timestamp>;
}

export interface IdqDbInterface extends DbInterface {
  idqApiKeys: IdqApiKeys;
  idqWorkspaceSettings: IdqWorkspaceSettings;
  idqMcpWriteLog: IdqMcpWriteLog;
  idqTaskLinks: IdqTaskLinks;
  idqTaskAssignees: IdqTaskAssignees;
  idqTaskSettings: IdqTaskSettings;
}

export type IdqKyselyDB = Kysely<IdqDbInterface>;
