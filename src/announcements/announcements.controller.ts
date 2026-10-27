import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequireMenuAccess } from '../auth/decorators/require-menu-access.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { OperatorMenu } from '../operators/menu-permissions.js';
import { UserRole } from '../users/entities/user.entity.js';
import { AnnouncementsService } from './announcements.service.js';
import {
  AnnouncementsQueryDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcement-input.dto.js';
import { AnnouncementResponseDto } from './dto/announcement-response.dto.js';

@ApiTags('Announcements')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@TenantScoped()
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get('active')
  @Roles(UserRole.Owner, UserRole.Operator, UserRole.Tutor, UserRole.Parent)
  @ApiPaginatedResponse(AnnouncementResponseDto)
  findActive(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.findActive(user.tenantId, user.role, query);
  }

  @Get()
  @Roles(UserRole.Owner, UserRole.Operator)
  @RequireMenuAccess(OperatorMenu.Announcements)
  @ApiPaginatedResponse(AnnouncementResponseDto)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnnouncementsQueryDto,
  ) {
    return this.service.findAll(user.tenantId, query);
  }

  @Get(':id')
  @Roles(UserRole.Owner, UserRole.Operator)
  @RequireMenuAccess(OperatorMenu.Announcements)
  @ApiOkResponse({ type: AnnouncementResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.tenantId, id);
  }

  @Post()
  @Roles(UserRole.Owner, UserRole.Operator)
  @RequireMenuAccess(OperatorMenu.Announcements)
  @ApiCreatedResponse({ type: AnnouncementResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.service.create(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.Owner, UserRole.Operator)
  @RequireMenuAccess(OperatorMenu.Announcements)
  @ApiOkResponse({ type: AnnouncementResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.service.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.Owner, UserRole.Operator)
  @RequireMenuAccess(OperatorMenu.Announcements)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Pengumuman dihapus permanen.' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user.tenantId, id);
  }
}
