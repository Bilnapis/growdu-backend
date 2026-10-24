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
import { Roles } from '../auth/decorators/roles.decorator.js';
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { PaginatedResponse } from '../common/dto/pagination-query.dto.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import { UserRole } from '../users/entities/user.entity.js';
import {
  CreateRoomDto,
  RoomsQueryDto,
  UpdateRoomDto,
  UpdateRoomStatusDto,
} from './dto/room-input.dto.js';
import {
  RoomDetailResponseDto,
  RoomListItemResponseDto,
  RoomsSummaryResponseDto,
} from './dto/room-response.dto.js';
import { RoomsService } from './rooms.service.js';

@ApiTags('Rooms')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner, UserRole.Operator)
@TenantScoped()
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiPaginatedResponse(RoomListItemResponseDto)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RoomsQueryDto,
  ): Promise<PaginatedResponse<RoomListItemResponseDto>> {
    return this.roomsService.findAll(user.tenantId, query);
  }

  @Get('summary')
  @ApiOkResponse({ type: RoomsSummaryResponseDto })
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RoomsSummaryResponseDto> {
    return this.roomsService.getSummary(user.tenantId);
  }

  @Get(':id')
  @ApiOkResponse({ type: RoomDetailResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoomDetailResponseDto> {
    return this.roomsService.findOne(user.tenantId, id);
  }

  @Post()
  @ApiCreatedResponse({ type: RoomDetailResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoomDto,
  ): Promise<RoomDetailResponseDto> {
    return this.roomsService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: RoomDetailResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomDetailResponseDto> {
    return this.roomsService.update(user.tenantId, id, dto);
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: RoomDetailResponseDto })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomStatusDto,
  ): Promise<RoomDetailResponseDto> {
    return this.roomsService.updateStatus(user.tenantId, id, dto.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Ruangan yang belum dipakai dihapus.' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.roomsService.remove(user.tenantId, id);
  }
}
