import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { IdqTaskBoardService } from './idq-task-board.service';
import { IdqTaskLinksService } from './idq-task-links.service';
import { IdqAttachmentSearchService } from '../mcp/idq-attachment-search.service';
import { IdqTaskAssigneesService } from './idq-task-assignees.service';
import {
  LABEL_VALUE_MAX_LENGTH,
  LABEL_VALUE_PATTERN,
  TASK_STATUSES,
  TaskStatus,
  toLabelSlug,
} from './idq-task-fields';
import { IdqTaskLinkType } from '../database/idq-db.types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Label values are written like label names: "Offerta formativa" becomes
// "offerta-formativa".
const slug = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? toLabelSlug(value) : value;
const slugEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.map((v) => (typeof v === 'string' ? toLabelSlug(v) : v)),
        ),
      ]
    : value;
const LABEL_VALUE_MESSAGE =
  'Values can only contain letters, numbers, hyphens, underscores and tildes';

export class IdqTaskBoardDto {
  @IsUUID()
  spaceId: string;
}

export class IdqTaskPageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  pageId: string;
}

export class IdqTaskSetStatusDto extends IdqTaskPageDto {
  @IsIn(TASK_STATUSES)
  status: TaskStatus;
}

export class IdqTaskCreateDto {
  @IsUUID()
  spaceId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @IsIn(TASK_STATUSES)
  status: TaskStatus;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;
}

export class IdqTaskSetFieldsDto extends IdqTaskPageDto {
  // null removes the priority
  @IsOptional()
  @Transform(slug)
  @IsString()
  @MaxLength(LABEL_VALUE_MAX_LENGTH)
  @Matches(LABEL_VALUE_PATTERN, { message: LABEL_VALUE_MESSAGE })
  priority?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Transform(slugEach)
  @IsString({ each: true })
  @MaxLength(LABEL_VALUE_MAX_LENGTH, { each: true })
  @Matches(LABEL_VALUE_PATTERN, { each: true, message: LABEL_VALUE_MESSAGE })
  areas?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Transform(slugEach)
  @IsString({ each: true })
  @MaxLength(LABEL_VALUE_MAX_LENGTH, { each: true })
  @Matches(LABEL_VALUE_PATTERN, { each: true, message: LABEL_VALUE_MESSAGE })
  assignees?: string[];
}

export class IdqTaskAssigneeDto {
  @Transform(slug)
  @IsString()
  @MaxLength(LABEL_VALUE_MAX_LENGTH)
  @Matches(LABEL_VALUE_PATTERN, { message: LABEL_VALUE_MESSAGE })
  value: string;

  // null removes the link and goes back to matching by name
  @IsOptional()
  @IsUUID()
  userId?: string | null;
}

const LINK_TYPES: IdqTaskLinkType[] = ['page', 'attachment', 'url'];

export class IdqTaskAddLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  taskPageId: string;

  @IsIn(LINK_TYPES)
  type: IdqTaskLinkType;

  @ValidateIf((o) => o.type === 'page')
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetPageId?: string;

  @ValidateIf((o) => o.type === 'attachment')
  @IsUUID()
  attachmentId?: string;

  // Only http(s): no javascript: or data: URLs in the links we render.
  @ValidateIf((o) => o.type === 'url')
  @Transform(trim)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  title?: string;
}

export class IdqTaskLinkIdDto {
  @IsUUID()
  linkId: string;
}

export class IdqTaskAttachmentSearchDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  query?: string;
}

/**
 * Task board (issue #3). Every endpoint checks the space and page
 * permissions of the current user: see IdqTaskAccess.
 */
@UseGuards(JwtAuthGuard)
@Controller('idq/tasks')
export class IdqTasksController {
  constructor(
    private readonly board: IdqTaskBoardService,
    private readonly links: IdqTaskLinksService,
    private readonly attachmentSearch: IdqAttachmentSearchService,
    private readonly assignees: IdqTaskAssigneesService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('board')
  getBoard(
    @Body() dto: IdqTaskBoardDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.board.getBoard(dto.spaceId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('page-info')
  getPageInfo(
    @Body() dto: IdqTaskPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.board.getPageInfo(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('set-status')
  async setStatus(
    @Body() dto: IdqTaskSetStatusDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.board.setStatus(dto.pageId, dto.status, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @Body() dto: IdqTaskCreateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.board.createTask(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('set-fields')
  async setFields(
    @Body() dto: IdqTaskSetFieldsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.board.setFields(dto.pageId, dto, user, workspace);
  }

  /** Values to choose from when editing a task of the space. */
  @HttpCode(HttpStatus.OK)
  @Post('field-options')
  getFieldOptions(
    @Body() dto: IdqTaskBoardDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.board.getFieldOptions(dto.spaceId, user, workspace);
  }

  /** Who each `ref-` label stands for. Workspace admins only. */
  @HttpCode(HttpStatus.OK)
  @Post('assignees/list')
  listAssignees(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.assignees.listMappings(user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('assignees/set')
  async setAssignee(
    @Body() dto: IdqTaskAssigneeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assignees.setMapping(
      dto.value,
      dto.userId ?? null,
      user,
      workspace,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('links/add')
  addLink(
    @Body() dto: IdqTaskAddLinkDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.links.add(dto, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('links/remove')
  async removeLink(
    @Body() dto: IdqTaskLinkIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.links.remove(dto.linkId, user, workspace.id);
  }

  /** Attachments to link, among those the user can open. */
  @HttpCode(HttpStatus.OK)
  @Post('attachments/search')
  searchAttachments(
    @Body() dto: IdqTaskAttachmentSearchDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.attachmentSearch.search(user, workspace.id, {
      query: dto.query ?? '',
      limit: 20,
    });
  }
}
