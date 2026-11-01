import { HttpException } from '@nestjs/common';
import type { McpServer } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { IdqApiKeyPrincipal } from '../../api-keys/idq-api-key.service';
import { IdqMcpCoreService, McpInputError } from '../idq-mcp-core.service';
import { IdqMcpWriteLogService } from '../idq-mcp-write-log.service';
import { IdqAttachmentSearchService } from '../idq-attachment-search.service';

export type ToolContext = {
  principal: IdqApiKeyPrincipal;
  core: IdqMcpCoreService;
  attachments: IdqAttachmentSearchService;
  writeLog: IdqMcpWriteLogService;
};

export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

export type ToolDefinition<S extends z.ZodObject<any>> = {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  /** Gli strumenti di scrittura vengono registrati nel log IDQ. */
  write: boolean;
  /** Per destructiveHint: cambia o sposta contenuti esistenti. */
  destructive?: boolean;
  handler: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
};

export function defineTool<S extends z.ZodObject<any>>(
  def: ToolDefinition<S>,
): ToolDefinition<S> {
  return def;
}

function errorMessage(err: unknown): string {
  if (err instanceof McpInputError) return `Invalid input: ${err.message}`;
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const response = err.getResponse() as any;
    const message =
      typeof response === 'string'
        ? response
        : Array.isArray(response?.message)
          ? response.message.join('; ')
          : (response?.message ?? err.message);
    if (status === 403) {
      return `Forbidden: you do not have permission for this action (${message})`;
    }
    if (status === 404) return `Not found: ${message}`;
    return `Error ${status}: ${message}`;
  }
  return 'Internal error while running the tool';
}

export function textResult(value: unknown): ToolResult {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

export function registerTools(
  server: McpServer,
  tools: ToolDefinition<any>[],
  ctx: ToolContext,
  logger: { error: (msg: string) => void },
) {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          title: tool.title,
          readOnlyHint: !tool.write,
          destructiveHint: tool.write ? Boolean(tool.destructive) : false,
          idempotentHint: !tool.write,
          openWorldHint: false,
        },
      },
      (async (args: unknown) => {
        const { principal } = ctx;
        try {
          const result = await tool.handler(args, ctx);
          if (tool.write) {
            await ctx.writeLog.log({
              workspaceId: principal.workspace.id,
              userId: principal.user.id,
              apiKeyId: principal.apiKeyId,
              tool: tool.name,
              args,
              success: true,
            });
          }
          return textResult(result);
        } catch (err) {
          const message = errorMessage(err);
          if (
            !(err instanceof HttpException) &&
            !(err instanceof McpInputError)
          ) {
            logger.error(
              `MCP tool ${tool.name} failed: ${(err as Error)?.stack ?? err}`,
            );
          }
          if (tool.write) {
            await ctx.writeLog.log({
              workspaceId: principal.workspace.id,
              userId: principal.user.id,
              apiKeyId: principal.apiKeyId,
              tool: tool.name,
              args,
              success: false,
              error: message,
            });
          }
          return { ...textResult(message), isError: true };
        }
      }) as any,
    );
  }
}
