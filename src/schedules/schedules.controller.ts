import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { PaginatedResponse } from '../common/dto/pagination-query.dto.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import { UserRole } from '../users/entities/user.entity.js';
import { SchedulesQueryDto } from './dto/schedule-query.dto.js';
import {
  ScheduleListItemResponseDto,
  SchedulesSummaryResponseDto,
} from './dto/schedule-response.dto.js';
import { SchedulesService } from './schedules.service.js';

@ApiTags('Schedules')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner, UserRole.Operator, UserRole.Tutor)
@TenantScoped()
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @ApiPaginatedResponse(ScheduleListItemResponseDto)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SchedulesQueryDto,
  ): Promise<PaginatedResponse<ScheduleListItemResponseDto>> {
    return this.schedulesService.findAll(user, query);
  }

  @Get('summary')
  @ApiOkResponse({ type: SchedulesSummaryResponseDto })
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SchedulesSummaryResponseDto> {
    return this.schedulesService.getSummary(user);
  }
}
