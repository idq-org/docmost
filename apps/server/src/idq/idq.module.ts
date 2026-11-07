import { Module } from '@nestjs/common';
import { IdqMigrationService } from './database/idq-migration.service';
import { IdqApiKeyService } from './api-keys/idq-api-key.service';
import { IdqApiKeyController } from './api-keys/idq-api-key.controller';
import { IdqSettingsService } from './settings/idq-settings.service';
import { IdqSettingsController } from './settings/idq-settings.controller';
import { IdqMcpController } from './mcp/idq-mcp.controller';
import { IdqMcpService } from './mcp/idq-mcp.service';
import { IdqMcpCoreService } from './mcp/idq-mcp-core.service';
import { IdqMcpRateLimitService } from './mcp/idq-mcp-rate-limit.service';
import { IdqMcpWriteLogService } from './mcp/idq-mcp-write-log.service';
import { IdqAttachmentSearchService } from './mcp/idq-attachment-search.service';
import { IdqTasksController } from './tasks/idq-tasks.controller';
import { IdqTaskBoardService } from './tasks/idq-task-board.service';
import { IdqTaskLinksService } from './tasks/idq-task-links.service';
import { IdqTaskLabelStore } from './tasks/idq-task-label-store';
import { IdqTaskAccess } from './tasks/idq-task-access';
import { IdqTaskAssigneesService } from './tasks/idq-task-assignees.service';
import { IdqTaskSettingsService } from './tasks/idq-task-settings.service';

/**
 * Informatici di Quartiere features (AGPL fork of Docmost), written from
 * scratch: nothing comes from the Enterprise folders. Every IDQ server
 * feature registers here, so app.module.ts only imports this module.
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
    IdqApiKeyService,
    IdqSettingsService,
    IdqMcpService,
    IdqMcpCoreService,
    IdqMcpRateLimitService,
    IdqMcpWriteLogService,
    IdqAttachmentSearchService,
    // Task board (issue #3)
    IdqTaskBoardService,
    IdqTaskLinksService,
    IdqTaskLabelStore,
    IdqTaskAccess,
    IdqTaskAssigneesService,
    IdqTaskSettingsService,
  ],
})
export class IdqModule {}
