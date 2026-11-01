import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import { FileMigrationProvider, Migrator, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { MigrationService } from '@docmost/db/services/migration.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';

export const IDQ_MIGRATION_TABLE = 'idq_kysely_migration';
export const IDQ_MIGRATION_LOCK_TABLE = 'idq_kysely_migration_lock';

export function createIdqMigrator(db: KyselyDB): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
    migrationTableName: IDQ_MIGRATION_TABLE,
    migrationLockTableName: IDQ_MIGRATION_LOCK_TABLE,
  });
}

/**
 * Applies the IDQ migrations at startup, after Docmost's (our tables have
 * foreign keys to theirs). They have their own tracking table, so migrations
 * coming from upstream never end up in the middle of ours.
 */
@Injectable()
export class IdqMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger('IdqMigrationService');

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environmentService: EnvironmentService,
  ) {}

  async onApplicationBootstrap() {
    const production = this.environmentService.getNodeEnv() === 'production';
    if (production) {
      // Idempotent: does nothing if DatabaseModule already applied them.
      // (DatabaseModule doesn't export MigrationService, so we create it.)
      await new MigrationService(this.db).migrateToLatest();
    } else if (!(await this.coreSchemaExists())) {
      // In development Docmost's migrations are run by hand
      // (pnpm --filter server migration:latest), and ours need their tables.
      this.logger.warn(
        'Docmost tables not found: run the Docmost migrations, then restart ' +
          'to apply the IDQ migrations.',
      );
      return;
    }

    const { error, results } = await createIdqMigrator(
      this.db,
    ).migrateToLatest();

    results?.forEach((it) => {
      if (it.status === 'Success') {
        this.logger.log(`IDQ migration "${it.migrationName}" executed`);
      } else if (it.status === 'Error') {
        this.logger.error(`IDQ migration "${it.migrationName}" failed`);
      }
    });

    if (error) {
      this.logger.error(error);
      if (production) {
        process.exit(1);
      }
    }
  }

  private async coreSchemaExists(): Promise<boolean> {
    const { rows } = await sql<{
      table: string | null;
    }>`select to_regclass('workspaces')::text as table`.execute(this.db);
    return Boolean(rows[0]?.table);
  }
}
