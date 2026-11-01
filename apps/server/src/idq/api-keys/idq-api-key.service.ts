import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { IdqKyselyDB } from '../database/idq-db.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { isUserDisabled } from '../../common/helpers';

export const IDQ_API_KEY_PREFIX = 'idq_';
const MAX_ACTIVE_KEYS_PER_USER = 20;

export type IdqApiKeySummary = {
  id: string;
  name: string;
  keyHint: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type IdqApiKeyPrincipal = {
  apiKeyId: string;
  user: User;
  workspace: Workspace;
};

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function generateApiKey(): string {
  return IDQ_API_KEY_PREFIX + randomBytes(32).toString('base64url');
}

@Injectable()
export class IdqApiKeyService {
  constructor(
    @InjectKysely() private readonly db: IdqKyselyDB,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  async list(userId: string, workspaceId: string): Promise<IdqApiKeySummary[]> {
    return this.db
      .selectFrom('idqApiKeys')
      .select(['id', 'name', 'keyHint', 'expiresAt', 'lastUsedAt', 'createdAt'])
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .execute() as unknown as Promise<IdqApiKeySummary[]>;
  }

  /** Crea una chiave e la restituisce in chiaro: è l'unica volta. */
  async create(
    userId: string,
    workspaceId: string,
    name: string,
    expiresAt: Date | null,
  ): Promise<IdqApiKeySummary & { key: string }> {
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Expiration date must be in the future');
    }

    const { count } = await this.db
      .selectFrom('idqApiKeys')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
    if (Number(count) >= MAX_ACTIVE_KEYS_PER_USER) {
      throw new BadRequestException(
        `You can have at most ${MAX_ACTIVE_KEYS_PER_USER} active API keys`,
      );
    }

    const key = generateApiKey();
    const row = await this.db
      .insertInto('idqApiKeys')
      .values({
        workspaceId,
        userId,
        name,
        keyHash: hashApiKey(key),
        keyHint: key.slice(0, IDQ_API_KEY_PREFIX.length + 6),
        expiresAt,
      })
      .returning([
        'id',
        'name',
        'keyHint',
        'expiresAt',
        'lastUsedAt',
        'createdAt',
      ])
      .executeTakeFirstOrThrow();

    return { ...(row as unknown as IdqApiKeySummary), key };
  }

  async revoke(id: string, userId: string, workspaceId: string): Promise<void> {
    const result = await this.db
      .updateTable('idqApiKeys')
      .set({ revokedAt: new Date() })
      .where('id', '=', id)
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .executeTakeFirst();

    if (!result.numUpdatedRows || Number(result.numUpdatedRows) === 0) {
      throw new NotFoundException('API key not found');
    }
  }

  /** Revoca tutte le chiavi di un utente (per esempio quando viene disattivato). */
  async revokeAllForUser(userId: string, workspaceId: string): Promise<void> {
    await this.db
      .updateTable('idqApiKeys')
      .set({ revokedAt: new Date() })
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .execute();
  }

  /**
   * Verifica una chiave a ogni richiesta: niente cache, così una chiave
   * revocata smette subito di funzionare. Restituisce null se non è valida.
   */
  async authenticate(
    key: string | undefined,
    workspaceId?: string | null,
  ): Promise<IdqApiKeyPrincipal | null> {
    if (!key || !key.startsWith(IDQ_API_KEY_PREFIX) || key.length > 200) {
      return null;
    }

    const keyHash = hashApiKey(key);
    const row = await this.db
      .selectFrom('idqApiKeys')
      .select(['id', 'userId', 'workspaceId', 'keyHash', 'expiresAt'])
      .where('keyHash', '=', keyHash)
      .where('revokedAt', 'is', null)
      .executeTakeFirst();

    if (
      !row ||
      !timingSafeEqual(Buffer.from(row.keyHash), Buffer.from(keyHash))
    ) {
      return null;
    }
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    if (workspaceId && workspaceId !== row.workspaceId) {
      return null;
    }

    const [user, workspace] = await Promise.all([
      this.userRepo.findById(row.userId, row.workspaceId),
      this.workspaceRepo.findById(row.workspaceId),
    ]);
    if (!user || isUserDisabled(user) || !workspace) {
      return null;
    }

    // Non blocca la richiesta: è solo informativo.
    this.db
      .updateTable('idqApiKeys')
      .set({ lastUsedAt: new Date() })
      .where('id', '=', row.id)
      .execute()
      .catch(() => undefined);

    return { apiKeyId: row.id, user, workspace };
  }
}
