import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { IdqKyselyDB } from '../database/idq-db.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { isUserDisabled } from '../../common/helpers';

export const IDQ_API_KEY_PREFIX = 'idq_';
const MAX_ACTIVE_KEYS_PER_USER = 20;
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;
const DISABLED_USERS_SWEEP_MS = 5 * 60 * 1000;

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
  private readonly logger = new Logger('IdqApiKeyService');

  constructor(
    @InjectKysely() private readonly db: IdqKyselyDB,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  /** Lists the user's keys that aren't revoked, expired ones included. */
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

  /** Creates a key and returns it in clear text: this is the only time. */
  async create(
    userId: string,
    workspaceId: string,
    name: string,
    expiresAt: Date | null,
  ): Promise<IdqApiKeySummary & { key: string }> {
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Expiration date must be in the future');
    }

    // Expired keys no longer work, so they don't count toward the limit.
    const { count } = await this.db
      .selectFrom('idqApiKeys')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .where((eb) =>
        eb.or([eb('expiresAt', 'is', null), eb('expiresAt', '>', new Date())]),
      )
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

  /** Revokes all the keys of a user. */
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
   * Revokes the keys of deactivated or deleted users, as core does with their
   * sessions, so the keys don't work again if the user is reactivated.
   * `authenticate` already refuses them while the user is disabled; this
   * sweep makes the revocation permanent without changing Docmost's code.
   */
  @Interval('idq-api-key-disabled-users', DISABLED_USERS_SWEEP_MS)
  async revokeKeysOfDisabledUsers(): Promise<void> {
    try {
      const result = await this.db
        .updateTable('idqApiKeys')
        .set({ revokedAt: new Date() })
        .where('revokedAt', 'is', null)
        .where('userId', 'in', (eb) =>
          eb
            .selectFrom('users')
            .select('users.id')
            .where((w) =>
              w.or([
                w('users.deactivatedAt', 'is not', null),
                w('users.deletedAt', 'is not', null),
              ]),
            ),
        )
        .executeTakeFirst();
      const revoked = Number(result.numUpdatedRows ?? 0);
      if (revoked > 0) {
        this.logger.log(`Revoked ${revoked} API key(s) of disabled users`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to revoke API keys of disabled users: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Checks a key on every request, with no cache, so a revoked key stops
   * working immediately. Returns null if the key isn't valid.
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
      .select(['id', 'userId', 'workspaceId', 'keyHash', 'expiresAt', 'lastUsedAt'])
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
    if (!workspace) {
      return null;
    }
    if (!user || isUserDisabled(user)) {
      await this.revokeAllForUser(row.userId, row.workspaceId);
      return null;
    }

    // Informational only, so it doesn't block the request, and it's written
    // at most once every few minutes to avoid an UPDATE on every call.
    const lastUsedAt = row.lastUsedAt ? new Date(row.lastUsedAt).getTime() : 0;
    if (Date.now() - lastUsedAt > LAST_USED_RESOLUTION_MS) {
      this.db
        .updateTable('idqApiKeys')
        .set({ lastUsedAt: new Date() })
        .where('id', '=', row.id)
        .execute()
        .catch(() => undefined);
    }

    return { apiKeyId: row.id, user, workspace };
  }
}
