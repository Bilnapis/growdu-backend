import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { TenantResponseDto } from '../tenants/dto/tenant-response.dto.js';
import { UserRole } from '../users/entities/user.entity.js';
import { CreateOwnedTenantDto, UpdateOwnerDto } from './dto/owner-input.dto.js';
import { OwnerResponseDto } from './dto/owner-response.dto.js';
import { OwnersService } from './owners.service.js';

@ApiTags('Owners')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner)
@Controller('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get('me')
  @ApiOkResponse({ type: OwnerResponseDto })
  findMe(@CurrentUser() user: AuthenticatedUser): Promise<OwnerResponseDto> {
    return this.ownersService.findMe(user.id);
  }

  @Patch('me')
  @ApiOkResponse({ type: OwnerResponseDto })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOwnerDto,
  ): Promise<OwnerResponseDto> {
    return this.ownersService.updateMe(user.id, dto);
  }

  @Get('me/tenants')
  @ApiOkResponse({ type: [TenantResponseDto] })
  findMyTenants(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TenantResponseDto[]> {
    return this.ownersService.findMyTenants(user.id);
  }

  @Post('me/tenants')
  @ApiCreatedResponse({ type: TenantResponseDto })
  createTenant(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOwnedTenantDto,
  ): Promise<TenantResponseDto> {
    return this.ownersService.createTenant(user.id, dto);
  }
}
