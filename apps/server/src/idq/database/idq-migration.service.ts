import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import { FileMigrationProvider, Migrator } from 'kysely';
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
 * Applica le migrazioni IDQ all'avvio, dopo quelle di Docmost (le nostre
 * tabelle hanno chiavi esterne verso le loro). Hanno una tabella di
 * tracciamento separata: le migrazioni che arrivano da upstream non devono
 * mai trovarsi «in mezzo» alle nostre.
 */
@Injectable()
export class IdqMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger('IdqMigrationService');

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environmentService: EnvironmentService,
  ) {}

  async onApplicationBootstrap() {
    if (this.environmentService.getNodeEnv() === 'production') {
      // Idempotente: se DatabaseModule le ha già applicate non fa niente.
      // (MigrationService non è esportato da DatabaseModule: lo creiamo noi.)
      await new MigrationService(this.db).migrateToLatest();
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
      if (this.environmentService.getNodeEnv() === 'production') {
        process.exit(1);
      }
    }
  }
}
