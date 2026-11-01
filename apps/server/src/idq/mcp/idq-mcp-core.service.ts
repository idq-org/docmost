import { Injectable, OnModuleInit, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import slugify from '@sindresorhus/slugify';
import { PageController } from '../../core/page/page.controller';
import { SpaceController } from '../../core/space/space.controller';
import { CommentController } from '../../core/comment/comment.controller';
import { SearchController } from '../../core/search/search.controller';
import { WorkspaceController } from '../../core/workspace/controllers/workspace.controller';
import { UserController } from '../../core/user/user.controller';
import { PageService } from '../../core/page/services/page.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

export class McpInputError extends Error {}

/**
 * Validates a core DTO the way the app's global ValidationPipe does
 * (whitelist + transform), so the controllers get the same objects as from
 * an HTTP call.
 */
export async function toDto<T extends object>(
  cls: Type<T>,
  plain: Record<string, unknown>,
): Promise<T> {
  const clean = Object.fromEntries(
    Object.entries(plain).filter(([, v]) => v !== undefined),
  );
  const instance = plainToInstance(cls, clean);
  const errors = await validate(instance, {
    whitelist: true,
    stopAtFirstError: true,
  });
  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new McpInputError(messages.join('; ') || 'Invalid input');
  }
  return instance;
}

/**
 * Access to the core controllers. The MCP tools go through them instead of
 * calling repositories and services directly, so every call runs the same
 * permission checks (space and page) as the web app.
 */
@Injectable()
export class IdqMcpCoreService implements OnModuleInit {
  pages: PageController;
  spaces: SpaceController;
  comments: CommentController;
  search: SearchController;
  workspace: WorkspaceController;
  users: UserController;

  pageAccess: PageAccessService;
  pageService: PageService;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly environmentService: EnvironmentService,
    readonly pageRepo: PageRepo,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  onModuleInit() {
    const get = <T>(cls: Type<T>) => this.moduleRef.get(cls, { strict: false });
    this.pages = get(PageController);
    this.spaces = get(SpaceController);
    this.comments = get(CommentController);
    this.search = get(SearchController);
    this.workspace = get(WorkspaceController);
    this.users = get(UserController);
    this.pageAccess = get(PageAccessService);
    this.pageService = get(PageService);
  }

  /**
   * Position after the last child of a parent (null = space root). Uses the
   * same core method as the web app.
   */
  async lastChildPosition(
    spaceId: string,
    parentPageId: string | null,
  ): Promise<string> {
    return this.pageService.nextPagePosition(
      spaceId,
      parentPageId ?? undefined,
    );
  }

  /** Position of the first child of a parent (null = space root). */
  async firstChildPosition(
    spaceId: string,
    parentPageId: string | null,
  ): Promise<string | null> {
    let query = this.db
      .selectFrom('pages')
      .select(['position'])
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .where('position', 'is not', null)
      .orderBy('position', (ob) => ob.collate('C').asc())
      .limit(1);
    query = parentPageId
      ? query.where('parentPageId', '=', parentPageId)
      : query.where('parentPageId', 'is', null);
    const row = await query.executeTakeFirst();
    return row?.position ?? null;
  }

  /** Page URL, built like the client's buildPageSlug. */
  pageUrl(
    spaceSlug: string | undefined,
    slugId: string,
    title?: string | null,
  ) {
    if (!spaceSlug || !slugId) return undefined;
    const titleSlug = slugify(title?.substring(0, 70) || 'untitled', {
      customReplacements: [
        ['♥', ''],
        ['🦄', ''],
      ],
    });
    return `${this.environmentService.getAppUrl()}/s/${spaceSlug}/p/${titleSlug}-${slugId}`;
  }
}
