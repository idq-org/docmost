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
 * Attachment search by file name. Core doesn't have this search, so it's
 * ours: it only looks at the spaces the user is a member of (by the space
 * the page is in now), then filters with core's page permissions, like the
 * page search does.
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

    // Fetches more than the limit: some rows can drop out at the permission filter.
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
        'pages.spaceId',
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

    // Filter on the page's space, not on attachments.spaceId, which is a copy:
    // filterAccessiblePageIds below checks page restrictions, not membership.
    query = opts.spaceId
      ? query.where('pages.spaceId', '=', opts.spaceId)
      : query.where(
          'pages.spaceId',
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
