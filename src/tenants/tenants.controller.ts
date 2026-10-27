import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiPayloadTooLargeResponse,
} from '@nestjs/swagger';
import { RequireMenuAccess } from '../auth/decorators/require-menu-access.decorator.js';
import { OperatorMenu } from '../operators/menu-permissions.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { UserRole } from '../users/entities/user.entity.js';
import { TenantResponseDto } from './dto/tenant-response.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { TenantsService } from './tenants.service.js';
import type { TenantLogoUpload } from './tenant-logo-storage.service.js';

@ApiTags('Tenants')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('owned')
  @Roles(UserRole.Owner)
  @ApiOperation({ summary: 'Ambil daftar bimbel aktif milik owner' })
  @ApiOkResponse({ type: [TenantResponseDto] })
  findOwned(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TenantResponseDto[]> {
    return this.tenantsService.findActiveOwnedByUser(user.id);
  }

  @Get('me')
  @TenantScoped()
  @ApiOperation({ summary: 'Ambil tenant milik user yang sedang login' })
  @ApiOkResponse({ type: TenantResponseDto })
  findCurrent(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TenantResponseDto> {
    return this.tenantsService.findCurrent(user.tenantId);
  }

  @Patch('me')
  @TenantScoped()
  @Roles(UserRole.Owner, UserRole.Operator)
  @RequireMenuAccess(OperatorMenu.Settings)
  @ApiOperation({ summary: 'Perbarui identitas tenant saat ini' })
  @ApiOkResponse({ type: TenantResponseDto })
  updateCurrent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantDto,
  ): Promise<TenantResponseDto> {
    return this.tenantsService.updateCurrent(user.tenantId, dto);
  }

  @Post('me/logo')
  @TenantScoped()
  @Roles(UserRole.Owner, UserRole.Operator)
  @RequireMenuAccess(OperatorMenu.Settings)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary:
      'Unggah logo bimbel aktif; gunakan URL pada PATCH tenants/me untuk menyimpan',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      required: ['logoUrl'],
      properties: { logoUrl: { type: 'string', format: 'uri' } },
    },
  })
  @ApiBadRequestResponse({
    description: 'File harus PNG/JPEG persegi yang valid',
  })
  @ApiPayloadTooLargeResponse({ description: 'Ukuran file melebihi 2 MB' })
  uploadLogo(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: TenantLogoUpload | undefined,
  ): Promise<{ logoUrl: string }> {
    return this.tenantsService.uploadLogo(user.tenantId, file);
  }
}
