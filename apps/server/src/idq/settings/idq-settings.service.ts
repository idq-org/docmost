import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { IdqKyselyDB } from '../database/idq-db.types';

export type IdqWorkspaceSettingsView = {
  idqMcpEnabled: boolean;
};

/** Impostazioni IDQ del workspace, separate da quelle di Docmost. */
@Injectable()
export class IdqSettingsService {
  constructor(@InjectKysely() private readonly db: IdqKyselyDB) {}

  async get(workspaceId: string): Promise<IdqWorkspaceSettingsView> {
    const row = await this.db
      .selectFrom('idqWorkspaceSettings')
      .select(['idqMcpEnabled'])
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();

    return { idqMcpEnabled: row?.idqMcpEnabled ?? false };
  }

  async setIdqMcpEnabled(
    workspaceId: string,
    idqMcpEnabled: boolean,
  ): Promise<IdqWorkspaceSettingsView> {
    await this.db
      .insertInto('idqWorkspaceSettings')
      .values({ workspaceId, idqMcpEnabled })
      .onConflict((oc) =>
        oc
          .column('workspaceId')
          .doUpdateSet({ idqMcpEnabled, updatedAt: new Date() }),
      )
      .execute();

    return this.get(workspaceId);
  }
}
