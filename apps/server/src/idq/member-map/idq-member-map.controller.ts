import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { IdqMemberMapService } from './idq-member-map.service';
import {
  MEMBER_VISIBILITIES,
  MemberVisibility,
  PROVINCE_CODES,
} from './idq-member-map';

const provinceCode = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class IdqSetMemberLocationDto {
  @IsIn(MEMBER_VISIBILITIES)
  visibility: MemberVisibility;

  /** Province abbreviation, e.g. "BO". Required unless `hidden`, which ignores it. */
  @ValidateIf((dto) => dto.visibility !== 'hidden')
  @Transform(provinceCode)
  @IsIn(PROVINCE_CODES, { message: 'provinceCode must be a province code' })
  provinceCode?: string | null;
}

export class IdqAdminMemberLocationDto extends IdqSetMemberLocationDto {
  @IsUUID()
  userId: string;
}

export class IdqAdminUpdateDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => IdqAdminMemberLocationDto)
  members: IdqAdminMemberLocationDto[];
}

/**
 * Members map (issue #4). Only for members logged in to the workspace, from
 * an interactive session: never from public shares, API keys or OAuth.
 */
@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('idq/member-map')
export class IdqMemberMapController {
  constructor(
    private readonly memberMap: IdqMemberMapService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  /** Members per province, and the names of who chose to show theirs. */
  @HttpCode(HttpStatus.OK)
  @Post('/')
  getMap(@AuthWorkspace() workspace: Workspace) {
    return this.memberMap.getMap(workspace.id);
  }

  /** The province and visibility of the current user. */
  @HttpCode(HttpStatus.OK)
  @Post('me')
  getMine(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.memberMap.getLocation(user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('me/update')
  setMine(
    @Body() dto: IdqSetMemberLocationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.memberMap.setLocation(
      user.id,
      workspace.id,
      dto.visibility,
      dto.visibility === 'hidden' ? null : (dto.provinceCode ?? null),
    );
  }

  /** Admins: every member, with where they are on the map and who set it. */
  @HttpCode(HttpStatus.OK)
  @Post('admin/members')
  listMembers(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user, workspace);
    return this.memberMap.listForAdmin(workspace.id);
  }

  /**
   * Admins: put members who gave their consent on the map, change or remove
   * them. What members chose themselves is left as is (see `skipped`).
   */
  @HttpCode(HttpStatus.OK)
  @Post('admin/update')
  updateMembers(
    @Body() dto: IdqAdminUpdateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    return this.memberMap.updateAsAdmin(
      user,
      workspace.id,
      dto.members.map((m) => ({
        userId: m.userId,
        visibility: m.visibility,
        provinceCode: m.visibility === 'hidden' ? null : m.provinceCode,
      })),
    );
  }

  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }
}
