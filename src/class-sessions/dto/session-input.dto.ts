import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { StudyGroupScheduleInputDto } from '../../study-groups/dto/study-group-input.dto.js';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class ConfigurationInputDto {
  @ApiProperty({ format: 'date' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom: string;
  @ApiProperty({ format: 'date' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveUntil: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;
  @ApiProperty({ type: [StudyGroupScheduleInputDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StudyGroupScheduleInputDto)
  schedules: StudyGroupScheduleInputDto[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  studentIds: string[];
}
export class SessionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') studyGroupId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') tutorId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['scheduled', 'completed', 'cancelled'])
  status?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['pending', 'saved'])
  attendanceStatus?: string;
}
export class AttendanceInputDto {
  @ApiProperty() @IsUUID('4') studentId: string;
  @ApiProperty({ enum: ['present', 'excused', 'sick', 'absent'] })
  @IsIn(['present', 'excused', 'sick', 'absent'])
  status: 'present' | 'excused' | 'sick' | 'absent';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
export class SessionRecordDto {
  @ApiProperty() @IsInt() @Min(1) version: number;
  @ApiProperty({ type: [AttendanceInputDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique((item: AttendanceInputDto) => item.studentId)
  @ValidateNested({ each: true })
  @Type(() => AttendanceInputDto)
  attendance: AttendanceInputDto[];
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  topic: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  tutorNote?: string;
}
export class SessionOverrideDto {
  @ApiProperty() @IsInt() @Min(1) version: number;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  sessionDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') tutorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') roomId?: string;
  @ApiPropertyOptional({ enum: ['cancelled'] })
  @IsOptional()
  @IsIn(['cancelled'])
  status?: 'cancelled';
}
