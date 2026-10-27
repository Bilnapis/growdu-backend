import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { AnnouncementTargetRole } from '../announcement.types.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const zonedTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export class CreateAnnouncementDto {
  @ApiProperty({ maxLength: 150, example: 'Libur Maulid Nabi' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title: string;

  @ApiProperty({ maxLength: 10_000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  content: string;

  @ApiProperty({ enum: AnnouncementTargetRole })
  @IsEnum(AnnouncementTargetRole)
  targetRole: AnnouncementTargetRole;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Kosong berarti Draft. Wajib menyertakan zona waktu.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(zonedTimestamp)
  startsAt?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(zonedTimestamp)
  endsAt?: string | null;
}

export class UpdateAnnouncementDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ maxLength: 10_000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  content?: string;

  @ApiPropertyOptional({ enum: AnnouncementTargetRole })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(AnnouncementTargetRole)
  targetRole?: AnnouncementTargetRole;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(zonedTimestamp)
  startsAt?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(zonedTimestamp)
  endsAt?: string | null;
}

export class AnnouncementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AnnouncementTargetRole })
  @IsOptional()
  @IsEnum(AnnouncementTargetRole)
  targetRole?: AnnouncementTargetRole;
}
