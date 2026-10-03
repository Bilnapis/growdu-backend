import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { PaginatedResponse } from '../common/dto/pagination-query.dto.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import {
  PlatformAdminCreateTenantDto,
  PlatformAdminTenantsQueryDto,
  PlatformAdminUpdateTenantDto,
} from './dto/platform-admin-tenants.dto.js';
import {
  PlatformAdminOwnerResponseDto,
  PlatformAdminTenantManagementResponseDto,
} from './dto/platform-admin-tenant-management-response.dto.js';
import { PlatformAdminAccessGuard } from './guards/platform-admin-access.guard.js';
import { PlatformAdminTenantsService } from './platform-admin-tenants.service.js';

@ApiTags('Platform admin tenants')
@ApiBearerAuth()
@Public()
@UseGuards(PlatformAdminAccessGuard)
@Controller('platform-admin/tenants')
export class PlatformAdminTenantsController {
  constructor(private readonly tenantsService: PlatformAdminTenantsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar bimbel atau tenant lintas platform' })
  @ApiPaginatedResponse(PlatformAdminTenantManagementResponseDto)
  findAll(
    @Query() query: PlatformAdminTenantsQueryDto,
  ): Promise<PaginatedResponse<PlatformAdminTenantManagementResponseDto>> {
    return this.tenantsService.findAll(query);
  }

  @Get('owners')
  @ApiOperation({ summary: 'Daftar owner aktif yang dapat memiliki tenant' })
  @ApiOkResponse({ type: [PlatformAdminOwnerResponseDto] })
  findOwners(): Promise<PlatformAdminOwnerResponseDto[]> {
    return this.tenantsService.findActiveOwners();
  }

  @Post()
  @ApiOperation({ summary: 'Tambah bimbel atau tenant baru' })
  @ApiCreatedResponse({ type: PlatformAdminTenantManagementResponseDto })
  create(
    @Body() dto: PlatformAdminCreateTenantDto,
  ): Promise<PlatformAdminTenantManagementResponseDto> {
    return this.tenantsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Perbarui bimbel atau tenant' })
  @ApiOkResponse({ type: PlatformAdminTenantManagementResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlatformAdminUpdateTenantDto,
  ): Promise<PlatformAdminTenantManagementResponseDto> {
    return this.tenantsService.update(id, dto);
  }
}
