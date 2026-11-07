import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { IdqKyselyDB } from '../database/idq-db.types';
import {
  DEFAULT_TASK_VOCABULARY,
  InvalidVocabularyError,
  TASK_STATUSES,
  TaskStatus,
  TaskVocabulary,
  validateVocabulary,
} from './idq-task-fields';

export type TaskSettings = {
  vocabulary: TaskVocabulary;
  statuses: readonly TaskStatus[];
  /** The workspace still uses the defaults. */
  isDefault: boolean;
};

/** The label vocabulary of each workspace (see TaskVocabulary). */
@Injectable()
export class IdqTaskSettingsService {
  private readonly logger = new Logger('IdqTaskSettingsService');

  constructor(
    @InjectKysely() private readonly db: IdqKyselyDB,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  async vocabulary(workspaceId: string): Promise<TaskVocabulary> {
    return (await this.get(workspaceId)).vocabulary;
  }

  async get(workspaceId: string): Promise<TaskSettings> {
    const row = await this.db
      .selectFrom('idqTaskSettings')
      .select('vocabulary')
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    if (!row) {
      return this.settings(DEFAULT_TASK_VOCABULARY, true);
    }
    try {
      return this.settings(
        validateVocabulary(fromStored(row.vocabulary)),
        false,
      );
    } catch (err) {
      // Saved by an older version with other rules: fall back, don't break
      // the board.
      this.logger.warn(`Invalid task vocabulary for ${workspaceId}: ${err}`);
      return this.settings(DEFAULT_TASK_VOCABULARY, true);
    }
  }

  /** Workspace admins only. It doesn't rename existing labels. */
  async update(
    input: unknown,
    user: User,
    workspace: Workspace,
  ): Promise<TaskSettings> {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }

    let vocabulary: TaskVocabulary;
    try {
      vocabulary = validateVocabulary(input);
    } catch (err) {
      if (err instanceof InvalidVocabularyError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    // An object, not a JSON string: postgres.js serializes jsonb parameters
    // itself (a string would be stored as a JSON string).
    const stored = toStored(vocabulary);
    await this.db
      .insertInto('idqTaskSettings')
      .values({
        workspaceId: workspace.id,
        vocabulary: stored,
        updatedById: user.id,
      })
      .onConflict((oc) =>
        oc.column('workspaceId').doUpdateSet({
          vocabulary: stored,
          updatedById: user.id,
          updatedAt: sql`now()`,
        }),
      )
      .execute();

    return this.settings(vocabulary, false);
  }

  private settings(
    vocabulary: TaskVocabulary,
    isDefault: boolean,
  ): TaskSettings {
    return { vocabulary, statuses: TASK_STATUSES, isDefault };
  }
}

/**
 * Stored form of a vocabulary. Statuses are a list, not an object keyed by
 * status: the database's camelCase plugin rewrites the keys of JSON values
 * it reads (`in_progress` would come back as `inProgress`).
 */
type StoredVocabulary = {
  prefixes: TaskVocabulary['prefixes'];
  statuses: Array<{ status: TaskStatus; values: string[] }>;
  priorities: string[];
};

function toStored(vocabulary: TaskVocabulary): StoredVocabulary {
  return {
    prefixes: vocabulary.prefixes,
    statuses: TASK_STATUSES.map((status) => ({
      status,
      values: vocabulary.statuses[status],
    })),
    priorities: vocabulary.priorities,
  };
}

/** Back to the shape validateVocabulary checks. */
function fromStored(value: unknown): unknown {
  const stored = value as Partial<StoredVocabulary> | null;
  if (!stored || !Array.isArray(stored.statuses)) return value;
  return {
    ...stored,
    statuses: Object.fromEntries(
      stored.statuses.map((entry) => [entry?.status, entry?.values]),
    ),
  };
}
