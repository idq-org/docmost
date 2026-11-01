import { z } from 'zod';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { toDto } from '../idq-mcp-core.service';
import { defineTool } from './tool-context';

export const otherTools = [
  defineTool({
    name: 'search_attachments',
    title: 'Search attachments',
    description:
      'Find files attached to pages by file name, among the pages the user ' +
      'can read. Returns the page each file belongs to.',
    inputSchema: z.object({
      query: z.string().min(1).max(200).describe('Part of the file name'),
      spaceId: z.string().uuid().optional().describe('Restrict to one space'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Max results (default 20)'),
    }),
    write: false,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const items = await ctx.attachments.search(user, workspace.id, {
        query: args.query,
        spaceId: args.spaceId,
        limit: args.limit ?? 20,
      });
      return { items };
    },
  }),

  defineTool({
    name: 'list_workspace_members',
    title: 'List workspace members',
    description:
      'List the members of the workspace with name, email and role. Useful ' +
      'to find who to mention or assign.',
    inputSchema: z.object({
      query: z.string().max(100).optional().describe('Filter by name or email'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Max results (default 50)'),
      cursor: z
        .string()
        .optional()
        .describe('Cursor from a previous call (nextCursor)'),
    }),
    write: false,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const result: any = await ctx.core.workspace.getWorkspaceMembers(
        await toDto(PaginationOptions, {
          limit: args.limit ?? 50,
          cursor: args.cursor,
          query: args.query,
        }),
        user,
        workspace,
      );
      return {
        items: (result?.items ?? []).map((m: any) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          deactivated: Boolean(m.deactivatedAt),
        })),
        nextCursor: result?.meta?.hasNextPage ? result.meta.nextCursor : null,
      };
    },
  }),

  defineTool({
    name: 'get_current_user',
    title: 'Get current user',
    description:
      'Get the user this connection acts as, and their workspace. All tools ' +
      "run with this user's permissions.",
    inputSchema: z.object({}),
    write: false,
    handler: async (_args, ctx) => {
      const { user, workspace } = ctx.principal;
      const info: any = await ctx.core.users.getUserInfo(user, workspace);
      return {
        user: {
          id: info.user.id,
          name: info.user.name,
          email: info.user.email,
          role: info.user.role,
          locale: info.user.locale ?? undefined,
        },
        workspace: {
          id: info.workspace.id,
          name: info.workspace.name,
          memberCount: info.workspace.memberCount,
        },
      };
    },
  }),
];
