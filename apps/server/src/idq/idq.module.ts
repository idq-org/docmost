import { Module } from '@nestjs/common';
import { IdqMigrationService } from './database/idq-migration.service';
import { IdqDocmost } from './core/idq-docmost.service';
import { IdqPageAccess } from './core/idq-page-access.service';
import { IdqPageLock } from './core/idq-page-lock.service';
import { IdqAttachmentSearchService } from './core/idq-attachment-search.service';
import { IdqApiKeyService } from './api-keys/idq-api-key.service';
import { IdqApiKeyController } from './api-keys/idq-api-key.controller';
import { IdqSettingsService } from './settings/idq-settings.service';
import { IdqSettingsController } from './settings/idq-settings.controller';
import { IdqMcpController } from './mcp/idq-mcp.controller';
import { IdqMcpService } from './mcp/idq-mcp.service';
import { IdqMcpCoreService } from './mcp/idq-mcp-core.service';
import { IdqMcpRateLimitService } from './mcp/idq-mcp-rate-limit.service';
import { IdqMcpWriteLogService } from './mcp/idq-mcp-write-log.service';
import { IdqTasksController } from './tasks/idq-tasks.controller';
import { IdqTaskBoardService } from './tasks/idq-task-board.service';
import { IdqTaskLinksService } from './tasks/idq-task-links.service';
import { IdqTaskLabelStore } from './tasks/idq-task-label-store';
import { IdqTaskAssigneesService } from './tasks/idq-task-assignees.service';
import { IdqTaskSettingsService } from './tasks/idq-task-settings.service';

/**
 * Informatici di Quartiere features (AGPL fork of Docmost), written from
 * scratch: nothing comes from the Enterprise folders. Every IDQ server
 * feature registers here, so app.module.ts only imports this module.
 *
 * Features reach Docmost's behavior (controllers, services, permission
 * checks) through ./core, so that an upstream change is fixed in one place.
 */
@Module({
  controllers: [
    IdqApiKeyController,
    IdqSettingsController,
    IdqMcpController,
    IdqTasksController,
  ],
  providers: [
    IdqMigrationService,
    // Shared access to Docmost
    IdqDocmost,
    IdqPageAccess,
    IdqPageLock,
    IdqAttachmentSearchService,
    // API keys and settings
    IdqApiKeyService,
    IdqSettingsService,
    // MCP (issue #5)
    IdqMcpService,
    IdqMcpCoreService,
    IdqMcpRateLimitService,
    IdqMcpWriteLogService,
    // Task board (issue #3)
    IdqTaskBoardService,
    IdqTaskLinksService,
    IdqTaskLabelStore,
    IdqTaskAssigneesService,
    IdqTaskSettingsService,
  ],
})
export class IdqModule {}
