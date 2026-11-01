import { z } from 'zod';
import { markdownToHtml } from '@docmost/editor-ext';
import {
  htmlToJson,
  jsonToMarkdown,
} from '../../../collaboration/collaboration.util';
import { PageIdDto } from '../../../core/comment/dto/comments.input';
import { CreateCommentDto } from '../../../core/comment/dto/create-comment.dto';
import { UpdateCommentDto } from '../../../core/comment/dto/update-comment.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { toDto } from '../idq-mcp-core.service';
import { defineTool } from './tool-context';

const pageId = z
  .string()
  .min(1)
  .describe(
    'Page ID (UUID) or the short slug ID shown at the end of page URLs',
  );
const content = z
  .string()
  .min(1)
  .max(20000)
  .describe('Comment text in Markdown');

async function markdownToCommentJson(markdown: string): Promise<string> {
  const html = await markdownToHtml(markdown);
  return JSON.stringify(htmlToJson(html as string));
}

function contentToMarkdown(value: unknown): string {
  if (!value) return '';
  try {
    const json = typeof value === 'string' ? JSON.parse(value) : value;
    return jsonToMarkdown(json).trim();
  } catch {
    return '';
  }
}

export function summarizeComment(comment: any) {
  if (!comment) return comment;
  return {
    id: comment.id,
    pageId: comment.pageId,
    parentCommentId: comment.parentCommentId ?? null,
    type: comment.type ?? undefined,
    selection: comment.selection ?? undefined,
    content: contentToMarkdown(comment.content),
    creator: comment.creator
      ? { id: comment.creator.id, name: comment.creator.name }
      : { id: comment.creatorId },
    resolvedAt: comment.resolvedAt ?? null,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt ?? null,
  };
}

export const commentTools = [
  defineTool({
    name: 'get_comments',
    title: 'Get comments',
    description:
      'List the comments of a page, oldest first, with their text as ' +
      'Markdown. Replies have parentCommentId set.',
    inputSchema: z.object({
      page_id: pageId,
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
      const result: any = await ctx.core.comments.findPageComments(
        await toDto(PageIdDto, { pageId: args.page_id }),
        await toDto(PaginationOptions, {
          limit: args.limit ?? 50,
          cursor: args.cursor,
        }),
        user,
        workspace,
      );
      return {
        items: (result?.items ?? []).map(summarizeComment),
        nextCursor: result?.meta?.hasNextPage ? result.meta.nextCursor : null,
      };
    },
  }),

  defineTool({
    name: 'create_comment',
    title: 'Create comment',
    description:
      'Add a comment to a page, or reply to an existing comment with ' +
      'parent_comment_id. Text is Markdown.',
    inputSchema: z.object({
      page_id: pageId,
      markdown: content,
      parent_comment_id: z
        .string()
        .uuid()
        .optional()
        .describe('ID of the comment to reply to'),
    }),
    write: true,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const comment = await ctx.core.comments.create(
        await toDto(CreateCommentDto, {
          pageId: args.page_id,
          content: await markdownToCommentJson(args.markdown),
          parentCommentId: args.parent_comment_id,
          type: 'page',
        }),
        user,
        workspace,
      );
      return summarizeComment(comment);
    },
  }),

  defineTool({
    name: 'update_comment',
    title: 'Update comment',
    description: 'Replace the text of a comment. Text is Markdown.',
    inputSchema: z.object({
      comment_id: z.string().uuid().describe('Comment ID'),
      markdown: content,
    }),
    write: true,
    destructive: true,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const comment = await ctx.core.comments.update(
        await toDto(UpdateCommentDto, {
          commentId: args.comment_id,
          content: await markdownToCommentJson(args.markdown),
        }),
        user,
        workspace,
      );
      return summarizeComment(comment);
    },
  }),
];
