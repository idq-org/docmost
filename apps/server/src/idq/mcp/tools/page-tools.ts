import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { PageInfoDto } from '../../../core/page/dto/page.dto';
import { CreatePageDto } from '../../../core/page/dto/create-page.dto';
import { UpdatePageDto } from '../../../core/page/dto/update-page.dto';
import { RecentPageDto } from '../../../core/page/dto/recent-page.dto';
import { SidebarPageDto } from '../../../core/page/dto/sidebar-page.dto';
import { DuplicatePageDto } from '../../../core/page/dto/duplicate-page.dto';
import {
  MovePageDto,
  MovePageToSpaceDto,
} from '../../../core/page/dto/move-page.dto';
import { SearchDTO } from '../../../core/search/dto/search.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { toDto } from '../idq-mcp-core.service';
import { defineTool, ToolContext } from './tool-context';

const pageId = z
  .string()
  .min(1)
  .describe(
    'Page ID (UUID) or the short slug ID shown at the end of page URLs',
  );
const spaceId = z.string().uuid().describe('Space ID (UUID)');
const limit = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Maximum number of results (1-100, default 20)');
const cursor = z
  .string()
  .optional()
  .describe('Pagination cursor returned as nextCursor by a previous call');

export function summarizePage(ctx: ToolContext, page: any) {
  if (!page) return page;
  return {
    id: page.id,
    slugId: page.slugId,
    title: page.title || 'Untitled',
    icon: page.icon ?? undefined,
    spaceId: page.spaceId,
    parentPageId: page.parentPageId ?? null,
    hasChildren: page.hasChildren,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    url: ctx.core.pageUrl(page.space?.slug, page.slugId, page.title),
  };
}

function paginated(ctx: ToolContext, result: any, map = summarizePage) {
  return {
    items: (result?.items ?? []).map((item: any) => map(ctx, item)),
    nextCursor: result?.meta?.hasNextPage ? result.meta.nextCursor : null,
  };
}

async function pagination(args: { limit?: number; cursor?: string }) {
  return toDto(PaginationOptions, {
    limit: args.limit ?? 20,
    cursor: args.cursor,
  });
}

async function findVisiblePage(ctx: ToolContext, id: string) {
  const page = await ctx.core.pageRepo.findById(id);
  if (!page || page.deletedAt) throw new NotFoundException('Page not found');
  await ctx.core.pageAccess.validateCanView(page, ctx.principal.user);
  return page;
}

async function fullPage(ctx: ToolContext, id: string) {
  const { user } = ctx.principal;
  const page: any = await ctx.core.pages.getPage(
    await toDto(PageInfoDto, { pageId: id, format: 'markdown' }),
    user,
  );
  if (page.deletedAt) throw new NotFoundException('Page not found');
  return {
    ...summarizePage(ctx, page),
    space: page.space
      ? { id: page.space.id, name: page.space.name, slug: page.space.slug }
      : undefined,
    creator: page.creator
      ? { id: page.creator.id, name: page.creator.name }
      : undefined,
    lastUpdatedBy: page.lastUpdatedBy
      ? { id: page.lastUpdatedBy.id, name: page.lastUpdatedBy.name }
      : undefined,
    permissions: page.permissions,
    content: typeof page.content === 'string' ? page.content : '',
  };
}

const contentDescription =
  'Page content in Markdown. Supports headings, lists, task lists, tables, ' +
  'links, images, code blocks and Mermaid diagrams (```mermaid code blocks).';

export const pageTools = [
  defineTool({
    name: 'search_pages',
    title: 'Search pages',
    description:
      'Full-text search across the pages the user can read. Optionally ' +
      'restrict to one space or to page titles only.',
    inputSchema: z.object({
      query: z.string().min(1).max(200).describe('Search text'),
      space_id: spaceId.optional(),
      title_only: z
        .boolean()
        .optional()
        .describe('Match page titles only (default false)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Max results (default 20)'),
      offset: z.number().int().min(0).optional().describe('Results to skip'),
    }),
    write: false,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const result: any = await ctx.core.search.pageSearch(
        await toDto(SearchDTO, {
          query: args.query,
          spaceId: args.space_id,
          titleOnly: args.title_only,
          limit: args.limit ?? 20,
          offset: args.offset,
        }),
        user,
        workspace,
      );
      return {
        items: (result?.items ?? []).map((item: any) => ({
          ...summarizePage(ctx, item),
          space: item.space
            ? {
                id: item.space.id,
                name: item.space.name,
                slug: item.space.slug,
              }
            : undefined,
          highlight: item.highlight,
        })),
      };
    },
  }),

  defineTool({
    name: 'get_page',
    title: 'Get page',
    description:
      'Get a page with its content as Markdown, plus space, author and ' +
      'whether the user can edit it.',
    inputSchema: z.object({ page_id: pageId }),
    write: false,
    handler: async (args, ctx) => fullPage(ctx, args.page_id),
  }),

  defineTool({
    name: 'create_page',
    title: 'Create page',
    description:
      'Create a page in a space, at the root or under a parent page. ' +
      'Content is written in Markdown.',
    inputSchema: z.object({
      space_id: spaceId,
      title: z.string().max(500).describe('Page title'),
      markdown: z.string().optional().describe(contentDescription),
      parent_page_id: pageId
        .optional()
        .describe('Parent page ID; omit to create the page at the space root'),
      icon: z
        .string()
        .max(20)
        .optional()
        .describe('An emoji used as page icon'),
    }),
    write: true,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      let parentPageId: string | undefined;
      if (args.parent_page_id) {
        const parent = await findVisiblePage(ctx, args.parent_page_id);
        parentPageId = parent.id;
      }
      const page: any = await ctx.core.pages.create(
        await toDto(CreatePageDto, {
          spaceId: args.space_id,
          title: args.title,
          icon: args.icon,
          parentPageId,
          content: args.markdown,
          format: args.markdown !== undefined ? 'markdown' : undefined,
        }),
        user,
        workspace,
      );
      return fullPage(ctx, page.id);
    },
  }),

  defineTool({
    name: 'update_page',
    title: 'Update page',
    description:
      'Update the title, icon and/or content of a page. Content is Markdown; ' +
      'by default it replaces the whole page, or use operation "append" / ' +
      '"prepend" to add to it.',
    inputSchema: z.object({
      page_id: pageId,
      title: z.string().max(500).optional().describe('New title'),
      icon: z.string().max(20).optional().describe('New emoji icon'),
      markdown: z.string().optional().describe(contentDescription),
      operation: z
        .enum(['replace', 'append', 'prepend'])
        .optional()
        .describe('How to apply content (default "replace")'),
    }),
    write: true,
    destructive: true,
    handler: async (args, ctx) => {
      if (
        args.title === undefined &&
        args.icon === undefined &&
        args.markdown === undefined
      ) {
        throw new BadRequestException(
          'Nothing to update: pass title, icon or content',
        );
      }
      const { user } = ctx.principal;
      const page = await findVisiblePage(ctx, args.page_id);
      await ctx.core.pages.update(
        await toDto(UpdatePageDto, {
          pageId: page.id,
          title: args.title,
          icon: args.icon,
          content: args.markdown,
          operation:
            args.markdown !== undefined
              ? (args.operation ?? 'replace')
              : undefined,
          format: args.markdown !== undefined ? 'markdown' : undefined,
        }),
        user,
      );
      return fullPage(ctx, page.id);
    },
  }),

  defineTool({
    name: 'list_pages',
    title: 'List pages',
    description:
      'List recently updated pages the user can read, in one space or ' +
      "across all of the user's spaces.",
    inputSchema: z.object({ space_id: spaceId.optional(), limit, cursor }),
    write: false,
    handler: async (args, ctx) => {
      const { user } = ctx.principal;
      const result = await ctx.core.pages.getRecentPages(
        await toDto(RecentPageDto, { spaceId: args.space_id }),
        await pagination(args),
        user,
      );
      return paginated(ctx, result);
    },
  }),

  defineTool({
    name: 'list_child_pages',
    title: 'List child pages',
    description:
      'List the child pages of a page, or the root pages of a space when ' +
      'only space_id is given. Use it to browse the page tree.',
    inputSchema: z.object({
      page_id: pageId.optional().describe('Parent page whose children to list'),
      space_id: spaceId
        .optional()
        .describe('Space whose root pages to list (when page_id is omitted)'),
      limit,
      cursor,
    }),
    write: false,
    handler: async (args, ctx) => {
      const { user } = ctx.principal;
      let dto: Record<string, unknown>;
      if (args.page_id) {
        const parent = await findVisiblePage(ctx, args.page_id);
        dto = { pageId: parent.id };
      } else if (args.space_id) {
        dto = { spaceId: args.space_id };
      } else {
        throw new BadRequestException('Pass page_id or space_id');
      }
      const result = await ctx.core.pages.getSidebarPages(
        await toDto(SidebarPageDto, dto),
        await pagination(args),
        user,
      );
      return paginated(ctx, result);
    },
  }),

  defineTool({
    name: 'duplicate_page',
    title: 'Duplicate page',
    description:
      'Duplicate a page, with its sub-pages, in the same space. The copy is ' +
      'placed next to the original.',
    inputSchema: z.object({ page_id: pageId }),
    write: true,
    handler: async (args, ctx) => {
      const page = await findVisiblePage(ctx, args.page_id);
      const result: any = await ctx.core.pages.duplicatePage(
        await toDto(DuplicatePageDto, { pageId: page.id }),
        ctx.principal.user,
      );
      return { page: summarizePage(ctx, result) };
    },
  }),

  defineTool({
    name: 'copy_page_to_space',
    title: 'Copy page to space',
    description:
      'Copy a page, with its sub-pages, to another space. The original ' +
      'stays where it is.',
    inputSchema: z.object({
      page_id: pageId,
      space_id: spaceId.describe('Destination space ID'),
    }),
    write: true,
    handler: async (args, ctx) => {
      const page = await findVisiblePage(ctx, args.page_id);
      const result: any = await ctx.core.pages.duplicatePage(
        await toDto(DuplicatePageDto, {
          pageId: page.id,
          spaceId: args.space_id,
        }),
        ctx.principal.user,
      );
      return { page: summarizePage(ctx, result) };
    },
  }),

  defineTool({
    name: 'move_page',
    title: 'Move page',
    description:
      'Move a page within its space: under another parent page, or to the ' +
      'space root when parent_page_id is null. Sub-pages move with it.',
    inputSchema: z.object({
      page_id: pageId,
      parent_page_id: pageId
        .nullable()
        .describe('New parent page ID, or null to move to the space root'),
      position: z
        .enum(['first', 'last'])
        .optional()
        .describe(
          'Place it first or last among its new siblings (default last)',
        ),
    }),
    write: true,
    destructive: true,
    handler: async (args, ctx) => {
      const { user } = ctx.principal;
      const page = await findVisiblePage(ctx, args.page_id);
      let parentPageId: string | null = null;
      if (args.parent_page_id) {
        const parent = await findVisiblePage(ctx, args.parent_page_id);
        if (parent.spaceId !== page.spaceId) {
          throw new BadRequestException(
            'The parent page is in another space: use move_page_to_space',
          );
        }
        parentPageId = parent.id;
      }
      const position =
        args.position === 'first'
          ? generateJitteredKeyBetween(
              null,
              await ctx.core.firstChildPosition(page.spaceId, parentPageId),
            )
          : generateJitteredKeyBetween(
              await ctx.core.lastChildPosition(page.spaceId, parentPageId),
              null,
            );
      await ctx.core.pages.movePage(
        await toDto(MovePageDto, { pageId: page.id, parentPageId, position }),
        user,
      );
      const moved = await ctx.core.pageRepo.findById(page.id, {
        includeSpace: true,
      });
      return { page: summarizePage(ctx, moved) };
    },
  }),

  defineTool({
    name: 'move_page_to_space',
    title: 'Move page to space',
    description:
      'Move a page, with its sub-pages, to the root of another space.',
    inputSchema: z.object({
      page_id: pageId,
      space_id: spaceId.describe('Destination space ID'),
    }),
    write: true,
    destructive: true,
    handler: async (args, ctx) => {
      const page = await findVisiblePage(ctx, args.page_id);
      await ctx.core.pages.movePageToSpace(
        await toDto(MovePageToSpaceDto, {
          pageId: page.id,
          spaceId: args.space_id,
        }),
        ctx.principal.user,
      );
      const moved = await ctx.core.pageRepo.findById(page.id, {
        includeSpace: true,
      });
      return { page: summarizePage(ctx, moved) };
    },
  }),
];
