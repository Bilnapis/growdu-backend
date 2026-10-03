import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { PaginatedResponse } from '../common/dto/pagination-query.dto.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import {
  PlatformAdminResetUserPasswordDto,
  PlatformAdminCreateUserDto,
  PlatformAdminUpdateUserDto,
  PlatformAdminUsersQueryDto,
} from './dto/platform-admin-users.dto.js';
import {
  PlatformAdminUserDetailResponseDto,
  PlatformAdminUserResponseDto,
} from './dto/platform-admin-user-response.dto.js';
import { PlatformAdminTenantResponseDto } from './dto/platform-admin-tenant-response.dto.js';
import { PlatformAdminAccessGuard } from './guards/platform-admin-access.guard.js';
import { PlatformAdminUsersService } from './platform-admin-users.service.js';

@ApiTags('Platform admin users')
@ApiBearerAuth()
@Public()
@UseGuards(PlatformAdminAccessGuard)
@Controller('platform-admin/users')
export class PlatformAdminUsersController {
  constructor(private readonly usersService: PlatformAdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar seluruh akun pengguna lintas tenant' })
  @ApiPaginatedResponse(PlatformAdminUserResponseDto)
  findAll(
    @Query() query: PlatformAdminUsersQueryDto,
  ): Promise<PaginatedResponse<PlatformAdminUserResponseDto>> {
    return this.usersService.findAll(query);
  }

  @Get('tenants')
  @ApiOkResponse({ type: [PlatformAdminTenantResponseDto] })
  findActiveTenants(): Promise<PlatformAdminTenantResponseDto[]> {
    return this.usersService.findActiveTenants();
  }

  @Get(':id')
  @ApiOkResponse({ type: PlatformAdminUserDetailResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PlatformAdminUserDetailResponseDto> {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOkResponse({ type: PlatformAdminUserResponseDto })
  create(
    @Body() dto: PlatformAdminCreateUserDto,
  ): Promise<PlatformAdminUserResponseDto> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: PlatformAdminUserDetailResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlatformAdminUpdateUserDto,
  ): Promise<PlatformAdminUserDetailResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Password diubah dan seluruh sesi pengguna dicabut.' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlatformAdminResetUserPasswordDto,
  ): Promise<void> {
    await this.usersService.resetPassword(id, dto);
  }
}
