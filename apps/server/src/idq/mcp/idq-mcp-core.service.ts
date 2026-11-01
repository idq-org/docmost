import { Injectable, OnModuleInit, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PageController } from '../../core/page/page.controller';
import { SpaceController } from '../../core/space/space.controller';
import { CommentController } from '../../core/comment/comment.controller';
import { SearchController } from '../../core/search/search.controller';
import { WorkspaceController } from '../../core/workspace/controllers/workspace.controller';
import { UserController } from '../../core/user/user.controller';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

export class McpInputError extends Error {}

/**
 * Valida un DTO del core come fa la ValidationPipe globale dell'app
 * (whitelist + transform), così ai controller arrivano gli stessi oggetti di
 * una chiamata HTTP.
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
 * Accesso ai controller del core. Gli strumenti MCP passano da qui invece di
 * chiamare direttamente repository e service: così ogni chiamata fa gli
 * stessi controlli di permesso (spazio e pagina) dell'app web.
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
  }

  /** Posizione dell'ultimo figlio di un genitore (null = radice dello spazio). */
  async lastChildPosition(
    spaceId: string,
    parentPageId: string | null,
  ): Promise<string | null> {
    let query = this.db
      .selectFrom('pages')
      .select(['position'])
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .orderBy('position', (ob) => ob.collate('C').desc())
      .limit(1);
    query = parentPageId
      ? query.where('parentPageId', '=', parentPageId)
      : query.where('parentPageId', 'is', null);
    const row = await query.executeTakeFirst();
    return row?.position ?? null;
  }

  /** Posizione del primo figlio di un genitore (null = radice dello spazio). */
  async firstChildPosition(
    spaceId: string,
    parentPageId: string | null,
  ): Promise<string | null> {
    let query = this.db
      .selectFrom('pages')
      .select(['position'])
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .orderBy('position', (ob) => ob.collate('C').asc())
      .limit(1);
    query = parentPageId
      ? query.where('parentPageId', '=', parentPageId)
      : query.where('parentPageId', 'is', null);
    const row = await query.executeTakeFirst();
    return row?.position ?? null;
  }

  pageUrl(
    spaceSlug: string | undefined,
    slugId: string,
    title?: string | null,
  ) {
    if (!spaceSlug || !slugId) return undefined;
    const titleSlug =
      (title ?? '')
        .substring(0, 70)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'untitled';
    return `${this.environmentService.getAppUrl()}/s/${spaceSlug}/p/${titleSlug}-${slugId}`;
  }
}
