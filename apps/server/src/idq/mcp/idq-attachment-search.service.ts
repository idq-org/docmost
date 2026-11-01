import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { User } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';

export type AttachmentSearchResult = {
  id: string;
  fileName: string;
  fileExt: string;
  mimeType: string | null;
  fileSize: number | null;
  pageId: string;
  spaceId: string;
  createdAt: Date;
};

/**
 * Ricerca degli allegati per nome file. Il core non ha questa ricerca, quindi
 * è nostra: considera solo gli spazi di cui l'utente è membro e poi filtra
 * con i permessi di pagina del core, come la ricerca delle pagine.
 */
@Injectable()
export class IdqAttachmentSearchService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  async search(
    user: User,
    workspaceId: string,
    opts: { query: string; spaceId?: string; limit: number },
  ): Promise<AttachmentSearchResult[]> {
    if (opts.spaceId) {
      const ability = await this.spaceAbility.createForUser(user, opts.spaceId);
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    const like = `%${opts.query.trim().replace(/[\\%_]/g, '\\$&')}%`;

    // Ne prende di più del limite: alcune possono cadere al filtro dei permessi.
    let query = this.db
      .selectFrom('attachments')
      .innerJoin('pages', 'pages.id', 'attachments.pageId')
      .select([
        'attachments.id',
        'attachments.fileName',
        'attachments.fileExt',
        'attachments.mimeType',
        'attachments.fileSize',
        'attachments.pageId',
        'attachments.spaceId',
        'attachments.createdAt',
      ])
      .where('attachments.workspaceId', '=', workspaceId)
      .where('attachments.deletedAt', 'is', null)
      .where('pages.deletedAt', 'is', null)
      .where((eb) =>
        eb(sql`lower(attachments.file_name)`, 'like', sql`lower(${like})`),
      )
      .orderBy('attachments.createdAt', 'desc')
      .limit(opts.limit * 4);

    query = opts.spaceId
      ? query.where('attachments.spaceId', '=', opts.spaceId)
      : query.where(
          'attachments.spaceId',
          'in',
          this.spaceMemberRepo.getUserSpaceIdsQuery(user.id),
        );

    const rows = (await query.execute()) as unknown as AttachmentSearchResult[];
    if (rows.length === 0) return [];

    const pageIds = [...new Set(rows.map((r) => r.pageId))];
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds,
        userId: user.id,
      }),
    );

    return rows
      .filter((r) => accessible.has(r.pageId))
      .slice(0, opts.limit)
      .map((r) => ({
        ...r,
        fileSize: r.fileSize === null ? null : Number(r.fileSize),
      }));
  }
}
