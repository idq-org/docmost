import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  createMcpHandler,
  McpHttpHandler,
  McpServer,
} from '@modelcontextprotocol/server';
import { IdqApiKeyPrincipal } from '../api-keys/idq-api-key.service';
import { IdqMcpCoreService } from './idq-mcp-core.service';
import { IdqMcpWriteLogService } from './idq-mcp-write-log.service';
import { IdqAttachmentSearchService } from './idq-attachment-search.service';
import { registerTools, ToolDefinition } from './tools/tool-context';
import { pageTools } from './tools/page-tools';
import { spaceTools } from './tools/space-tools';
import { commentTools } from './tools/comment-tools';
import { otherTools } from './tools/other-tools';

export const IDQ_MCP_TOOLS: ToolDefinition<any>[] = [
  ...pageTools,
  ...spaceTools,
  ...commentTools,
  ...otherTools,
];

const SERVER_INSTRUCTIONS =
  'MCP server of IDQ (Informatici di Quartiere), compatible with clients of ' +
  'the Docmost MCP. It gives access to the pages, spaces and comments of the ' +
  'IDQ knowledge base. Every tool acts as the user who owns the API key and ' +
  'only sees what that user can see. Page and comment content is Markdown. ' +
  'Use list_spaces to find spaces, search_pages to find pages, and get_page ' +
  'to read one.';

/**
 * Creates one MCP server per request, bound to the key's user. The tools
 * close over the principal, so no state is shared between users.
 */
@Injectable()
export class IdqMcpService implements OnModuleDestroy {
  private readonly logger = new Logger('IdqMcp');
  readonly handler: McpHttpHandler;

  constructor(
    private readonly core: IdqMcpCoreService,
    private readonly writeLog: IdqMcpWriteLogService,
    private readonly attachments: IdqAttachmentSearchService,
  ) {
    this.handler = createMcpHandler(
      (ctx) => {
        const principal = (ctx.authInfo?.extra as any)?.principal as
          | IdqApiKeyPrincipal
          | undefined;
        if (!principal) {
          // The controller always authenticates before calling the handler.
          throw new Error('Unauthenticated MCP request');
        }
        return this.createServer(principal);
      },
      {
        legacy: 'stateless',
        responseMode: 'json',
        onerror: (err) => this.logger.warn(`MCP transport: ${err.message}`),
      },
    );
  }

  createServer(principal: IdqApiKeyPrincipal): McpServer {
    const server = new McpServer(
      { name: 'idq-docmost', title: 'IDQ', version: '1.0.0' },
      { instructions: SERVER_INSTRUCTIONS },
    );
    registerTools(
      server,
      IDQ_MCP_TOOLS,
      {
        principal,
        core: this.core,
        writeLog: this.writeLog,
        attachments: this.attachments,
      },
      this.logger,
    );
    return server;
  }

  async onModuleDestroy() {
    await this.handler.close();
  }
}
