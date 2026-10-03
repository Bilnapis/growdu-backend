import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { UserRole } from '../users/entities/user.entity.js';
import { TenantResponseDto } from './dto/tenant-response.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('Tenants')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@TenantScoped()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Ambil tenant milik user yang sedang login' })
  @ApiOkResponse({ type: TenantResponseDto })
  findCurrent(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TenantResponseDto> {
    return this.tenantsService.findCurrent(user.tenantId);
  }

  @Patch('me')
  @Roles(UserRole.Owner, UserRole.Operator)
  @ApiOperation({ summary: 'Perbarui identitas tenant saat ini' })
  @ApiOkResponse({ type: TenantResponseDto })
  updateCurrent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantDto,
  ): Promise<TenantResponseDto> {
    return this.tenantsService.updateCurrent(user.tenantId, dto);
  }
}
