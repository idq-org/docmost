import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { Page, User } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { PageAccessService } from '../../core/page/page-access/page-access.service';

/**
 * Permission checks of the task board, built on Docmost's own rules: space
 * membership and role (casl), then page-level restrictions.
 */
@Injectable()
export class IdqTaskAccess implements OnModuleInit {
  private pageAccess: PageAccessService;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly moduleRef: ModuleRef,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageRepo: PageRepo,
  ) {}

  onModuleInit() {
    // PageModule doesn't export it: same approach as the IDQ MCP.
    this.pageAccess = this.moduleRef.get(PageAccessService, { strict: false });
  }

  /**
   * A page of the workspace that the user can see, or NotFoundException.
   * Deleted pages count as missing.
   */
  async findViewablePage(
    pageId: string,
    user: User,
    workspaceId: string,
  ): Promise<{ page: Page; canEdit: boolean }> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      throw new NotFoundException('Page not found');
    }
    try {
      const { canEdit } = await this.pageAccess.validateCanViewWithPermissions(
        page,
        user,
      );
      return { page, canEdit };
    } catch (err) {
      // Same answer as a missing page: don't reveal that it exists.
      if (
        err instanceof ForbiddenException ||
        err instanceof NotFoundException
      ) {
        throw new NotFoundException('Page not found');
      }
      throw err;
    }
  }

  /** Like findViewablePage, and throws ForbiddenException if read-only. */
  async findEditablePage(
    pageId: string,
    user: User,
    workspaceId: string,
  ): Promise<Page> {
    const { page, canEdit } = await this.findViewablePage(
      pageId,
      user,
      workspaceId,
    );
    if (!canEdit) {
      throw new ForbiddenException();
    }
    return page;
  }

  /**
   * Throws unless the user can read the pages of the space. Returns whether
   * they can also edit them (writer or admin).
   */
  async spacePermissions(
    user: User,
    spaceId: string,
  ): Promise<{ canEdit: boolean }> {
    // Throws NotFoundException when the user isn't a member of the space.
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    return {
      canEdit: ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page),
    };
  }

  /**
   * The pages, among the given ones, that the user can see: not deleted, in
   * the workspace, in a space they belong to, and not hidden by page-level
   * restrictions.
   */
  async visiblePageIds(
    pageIds: string[],
    userId: string,
    workspaceId: string,
  ): Promise<Set<string>> {
    const ids = [...new Set(pageIds)];
    if (ids.length === 0) return new Set();

    const rows = await this.db
      .selectFrom('pages')
      .select('id')
      .where('id', 'in', ids)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('spaceId', 'in', this.spaceMemberRepo.getUserSpaceIdsQuery(userId))
      .execute();
    if (rows.length === 0) return new Set();

    const accessible = await this.pagePermissionRepo.filterAccessiblePageIds({
      pageIds: rows.map((r) => r.id),
      userId,
    });
    return new Set(accessible);
  }

  /**
   * Like visiblePageIds, inside one space the user is a member of (the
   * caller has already checked it): skips the restriction query when the
   * space has no restricted pages.
   */
  async visiblePageIdsInSpace(
    pageIds: string[],
    userId: string,
    spaceId: string,
  ): Promise<Set<string>> {
    if (pageIds.length === 0) return new Set();
    const accessible = await this.pagePermissionRepo.filterAccessiblePageIds({
      pageIds,
      userId,
      spaceId,
    });
    return new Set(accessible);
  }
}
