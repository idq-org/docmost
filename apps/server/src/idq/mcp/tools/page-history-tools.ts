import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  PageHistoryIdDto,
  PageIdDto,
} from '../../../core/page/dto/page.dto';
import { jsonToMarkdown } from '../../../collaboration/collaboration.util';
import { toDto } from '../idq-mcp-core.service';
import {
  cursor,
  findVisiblePage,
  limit,
  pageId,
  pagination,
} from './page-tools';
import { defineTool, ToolContext } from './tool-context';

/**
 * Read-only tools for the version history of a page (issue #32). They call
 * the core page controller (`/pages/history`, `/pages/history/info`), so they
 * run the same permission checks as the history panel of the web app.
 *
 * A version is saved by Docmost after an edit, once the page has been quiet
 * for PAGE_HISTORY_INTERVAL (5 minutes by default, 1 minute for pages created
 * less than 5 minutes ago). Edits made with update_page are recorded the same
 * way as edits made in the editor.
 */

type HistoryUser = { id: string; name: string | null } | null | undefined;

const person = (user: HistoryUser) =>
  user ? { id: user.id, name: user.name } : null;

function summarizeVersion(version: any) {
  return {
    id: version.id,
    createdAt: version.createdAt,
    title: version.title || 'Untitled',
    // The user who made the last edit saved in this version
    author: person(version.lastUpdatedBy),
    // Everyone who edited the page since the previous version
    contributors: (version.contributors ?? []).map(person),
  };
}

async function findVersion(ctx: ToolContext, page: any, versionId: string) {
  const version: any = await ctx.core.pages.getPageHistoryInfo(
    await toDto(PageHistoryIdDto, { historyId: versionId }),
    ctx.principal.user,
  );
  // A version of another page is reported as missing, so that a version id
  // can't be read through a page it doesn't belong to.
  if (!version || version.pageId !== page.id) {
    throw new NotFoundException('Version not found for this page');
  }
  return version;
}

export const pageHistoryTools = [
  defineTool({
    name: 'list_page_history',
    title: 'List page history',
    description:
      'List the saved versions of a page, newest first, with id, date, ' +
      'title and author. A version is saved a few minutes after an edit ' +
      '(5 by default), so a change made just now may not be listed yet. ' +
      'Read a version with get_page_history.',
    inputSchema: z.object({ page_id: pageId, limit, cursor }),
    write: false,
    handler: async (args, ctx) => {
      const page = await findVisiblePage(ctx, args.page_id);
      const result: any = await ctx.core.pages.getPageHistory(
        await toDto(PageIdDto, { pageId: page.id }),
        await pagination(args),
        ctx.principal.user,
      );
      return {
        pageId: page.id,
        items: (result?.items ?? []).map(summarizeVersion),
        nextCursor: result?.meta?.hasNextPage ? result.meta.nextCursor : null,
      };
    },
  }),

  defineTool({
    name: 'get_page_history',
    title: 'Get page version',
    description:
      'Get one saved version of a page: its title and its content as ' +
      'Markdown, in the same format as get_page. To bring a version back, ' +
      'pass its content to update_page.',
    inputSchema: z.object({
      page_id: pageId,
      version_id: z
        .string()
        .uuid()
        .describe('Version ID (UUID), as returned by list_page_history'),
    }),
    write: false,
    handler: async (args, ctx) => {
      const page = await findVisiblePage(ctx, args.page_id);
      const version = await findVersion(ctx, page, args.version_id);
      return {
        ...summarizeVersion(version),
        pageId: page.id,
        icon: version.icon ?? undefined,
        content: version.content ? jsonToMarkdown(version.content) : '',
      };
    },
  }),
];
