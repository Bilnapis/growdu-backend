import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ReportPeriodDto {
  @ApiProperty({ example: '2026-09', pattern: '^20[0-9]{2}-(0[1-9]|1[0-2])$' })
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/)
  period: string;
}
export class ReportGroupQueryDto extends PaginationQueryDto {
  @ApiProperty({ example: '2026-09' })
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/)
  period: string;
  @ApiPropertyOptional({
    enum: ['unfilled', 'draft', 'partially_published', 'published'],
  })
  @IsOptional()
  @IsIn(['unfilled', 'draft', 'partially_published', 'published'])
  status?: string;
}
export class ReportPdfQueryDto extends ReportPeriodDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  studentId?: string;
}
export class CreateReportDto extends ReportPeriodDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') studyGroupId: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') tutorId: string;
}
export class ReportVersionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version: number;
}
export class ReportNoteInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') studentId: string;
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  note: string;
}
export class SaveReportDto extends ReportVersionDto {
  @ApiProperty({ maxLength: 10000 })
  @IsString()
  @MaxLength(10000)
  material: string;
  @ApiProperty({ maxLength: 10000 })
  @IsString()
  @MaxLength(10000)
  progress: string;
  @ApiProperty({ maxLength: 10000 })
  @IsString()
  @MaxLength(10000)
  followUp: string;
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MaxLength(5000)
  parentNote: string;
  @ApiProperty({ type: [ReportNoteInputDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique((n: ReportNoteInputDto) => n.studentId)
  @ValidateNested({ each: true })
  @Type(() => ReportNoteInputDto)
  notes: ReportNoteInputDto[];
}
export class ReviseReportDto extends ReportVersionDto {
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  reason: string;
}
export class ReportSettingsInputDto extends ReportVersionDto {
  @ApiProperty()
  @IsBoolean()
  @Transform(({ obj }: { obj: unknown }) =>
    typeof obj === 'object' && obj !== null && 'enabled' in obj
      ? obj.enabled
      : undefined,
  )
  enabled: boolean;
  @ApiProperty({ minimum: 1, maximum: 31 })
  @IsInt()
  @Min(1)
  @Max(31)
  generationDay: number;
}
