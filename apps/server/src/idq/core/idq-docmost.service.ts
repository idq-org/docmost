import { Injectable, OnModuleInit, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PageController } from '../../core/page/page.controller';
import { PageService } from '../../core/page/services/page.service';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { SpaceController } from '../../core/space/space.controller';
import { CommentController } from '../../core/comment/comment.controller';
import { SearchController } from '../../core/search/search.controller';
import { WorkspaceController } from '../../core/workspace/controllers/workspace.controller';
import { UserController } from '../../core/user/user.controller';
import { LabelService } from '../../core/label/label.service';

/**
 * The Docmost providers that IDQ features use but Docmost's modules don't
 * export, resolved in one place. If Docmost moves or renames one, this is
 * the file to fix.
 *
 * Controllers are called directly (not over HTTP) so that IDQ features run
 * the same permission checks and audit logs as the web app. Guards, pipes
 * and interceptors don't run on such calls: callers authenticate the user
 * and validate the DTOs themselves.
 */
@Injectable()
export class IdqDocmost implements OnModuleInit {
  pageController: PageController;
  spaceController: SpaceController;
  commentController: CommentController;
  searchController: SearchController;
  workspaceController: WorkspaceController;
  userController: UserController;
  pageService: PageService;
  pageAccess: PageAccessService;
  labelService: LabelService;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit() {
    const get = <T>(cls: Type<T>): T =>
      this.moduleRef.get(cls, { strict: false });
    this.pageController = get(PageController);
    this.spaceController = get(SpaceController);
    this.commentController = get(CommentController);
    this.searchController = get(SearchController);
    this.workspaceController = get(WorkspaceController);
    this.userController = get(UserController);
    this.pageService = get(PageService);
    this.pageAccess = get(PageAccessService);
    this.labelService = get(LabelService);
  }
}
