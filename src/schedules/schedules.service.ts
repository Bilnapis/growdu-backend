import { Injectable } from '@nestjs/common';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { getJakartaDayOfWeek } from '../common/datetime/jakarta-date.util.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { UserRole } from '../users/entities/user.entity.js';
import { SchedulesQueryDto } from './dto/schedule-query.dto.js';
import {
  ScheduleListItemResponseDto,
  SchedulesSummaryResponseDto,
} from './dto/schedule-response.dto.js';
import { SchedulesRepository } from './repositories/schedules.repository.js';

@Injectable()
export class SchedulesService {
  constructor(private readonly schedulesRepository: SchedulesRepository) {}

  async findAll(
    user: AuthenticatedUser,
    query: SchedulesQueryDto,
  ): Promise<PaginatedResponse<ScheduleListItemResponseDto>> {
    const [data, total] = await this.schedulesRepository.findPage(
      user.tenantId,
      query,
      this.getTutorScope(user),
    );

    return {
      data,
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async getSummary(
    user: AuthenticatedUser,
  ): Promise<SchedulesSummaryResponseDto> {
    const summary = await this.schedulesRepository.getSummary(
      user.tenantId,
      getJakartaDayOfWeek(),
      this.getTutorScope(user),
    );

    return {
      ...summary,
      schedulesWithAttendance: 0,
      schedulesPendingAttendance: summary.totalSchedules,
    };
  }

  private getTutorScope(user: AuthenticatedUser): string | undefined {
    return user.role === UserRole.Tutor ? user.id : undefined;
  }
}
