import { Injectable, Type } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import slugify from '@sindresorhus/slugify';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { IdqDocmost } from '../core/idq-docmost.service';

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
 * Access to the core controllers, through IdqDocmost. The MCP tools go
 * through them instead of calling repositories and services directly, so
 * every call runs the same permission checks (space and page) as the web
 * app.
 */
@Injectable()
export class IdqMcpCoreService {
  constructor(
    private readonly docmost: IdqDocmost,
    private readonly environmentService: EnvironmentService,
    readonly pageRepo: PageRepo,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  get pages() {
    return this.docmost.pageController;
  }
  get spaces() {
    return this.docmost.spaceController;
  }
  get comments() {
    return this.docmost.commentController;
  }
  get search() {
    return this.docmost.searchController;
  }
  get workspace() {
    return this.docmost.workspaceController;
  }
  get users() {
    return this.docmost.userController;
  }
  get pageAccess() {
    return this.docmost.pageAccess;
  }
  get pageService() {
    return this.docmost.pageService;
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
