import { z } from 'zod';
import { SpaceIdDto } from '../../../core/page/dto/page.dto';
import { CreateSpaceDto } from '../../../core/space/dto/create-space.dto';
import { UpdateSpaceDto } from '../../../core/space/dto/update-space.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { toDto } from '../idq-mcp-core.service';
import { defineTool } from './tool-context';

const spaceId = z.string().uuid().describe('Space ID (UUID)');
const slug = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  .describe(
    'URL slug: letters, numbers, "-" and "_", starting with a letter or number',
  );

function summarizeSpace(space: any) {
  if (!space) return space;
  return {
    id: space.id,
    name: space.name,
    slug: space.slug,
    description: space.description ?? null,
    visibility: space.visibility,
    memberCount: space.memberCount,
    role: space.membership?.role,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
}

export const spaceTools = [
  defineTool({
    name: 'list_spaces',
    title: 'List spaces',
    description:
      "List the spaces the user is a member of, with the user's role in each.",
    inputSchema: z.object({
      query: z.string().max(100).optional().describe('Filter by space name'),
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
      const result: any = await ctx.core.spaces.getWorkspaceSpaces(
        await toDto(PaginationOptions, {
          limit: args.limit ?? 50,
          cursor: args.cursor,
          query: args.query,
        }),
        ctx.principal.user,
      );
      return {
        items: (result?.items ?? []).map(summarizeSpace),
        nextCursor: result?.meta?.hasNextPage ? result.meta.nextCursor : null,
      };
    },
  }),

  defineTool({
    name: 'get_space',
    title: 'Get space',
    description: "Get the details of a space and the user's role in it.",
    inputSchema: z.object({ space_id: spaceId }),
    write: false,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const space = await ctx.core.spaces.getSpaceInfo(
        await toDto(SpaceIdDto, { spaceId: args.space_id }),
        user,
        workspace,
      );
      return summarizeSpace(space);
    },
  }),

  defineTool({
    name: 'create_space',
    title: 'Create space',
    description:
      'Create a new space. Requires permission to manage spaces in the ' +
      'workspace (usually admins); the creator becomes its admin.',
    inputSchema: z.object({
      name: z.string().min(2).max(100).describe('Space name'),
      slug,
      description: z.string().max(500).optional().describe('Short description'),
    }),
    write: true,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const space = await ctx.core.spaces.createSpace(
        await toDto(CreateSpaceDto, args),
        user,
        workspace,
      );
      return summarizeSpace(space);
    },
  }),

  defineTool({
    name: 'update_space',
    title: 'Update space',
    description:
      'Change the name, slug or description of a space. Requires space ' +
      'admin rights.',
    inputSchema: z.object({
      space_id: spaceId,
      name: z.string().min(2).max(100).optional().describe('New name'),
      slug: slug.optional(),
      description: z.string().max(500).optional().describe('New description'),
    }),
    write: true,
    destructive: true,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      await ctx.core.spaces.updateSpace(
        await toDto(UpdateSpaceDto, {
          spaceId: args.space_id,
          name: args.name,
          slug: args.slug,
          description: args.description,
        }),
        user,
        workspace,
      );
      const space = await ctx.core.spaces.getSpaceInfo(
        await toDto(SpaceIdDto, { spaceId: args.space_id }),
        user,
        workspace,
      );
      return summarizeSpace(space);
    },
  }),
];
