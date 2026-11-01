import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { IdqApiKeyService } from './idq-api-key.service';

export class CreateIdqApiKeyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}

export class IdqApiKeyIdDto {
  @IsUUID()
  id: string;
}

/**
 * IDQ personal API keys. They can only be managed from an interactive
 * session: a key can't create other keys.
 */
@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('idq/api-keys')
export class IdqApiKeyController {
  constructor(private readonly apiKeyService: IdqApiKeyService) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.apiKeyService.list(user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @Body() dto: CreateIdqApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.apiKeyService.create(
      user.id,
      workspace.id,
      dto.name.trim(),
      dto.expiresAt ?? null,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  async revoke(
    @Body() dto: IdqApiKeyIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.apiKeyService.revoke(dto.id, user.id, workspace.id);
  }
}
