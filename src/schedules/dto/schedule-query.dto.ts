import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export enum ScheduleEducationLevel {
  Elementary = 'sd',
  JuniorHigh = 'smp',
  SeniorHigh = 'sma',
  Other = 'other',
}

export class SchedulesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @ApiPropertyOptional({ enum: ScheduleEducationLevel })
  @IsOptional()
  @IsEnum(ScheduleEducationLevel)
  educationLevel?: ScheduleEducationLevel;
}
