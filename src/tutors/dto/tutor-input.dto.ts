import { Transform } from 'class-transformer';
import {
  IsDecimal,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTutorDto {
  @ApiProperty({ minLength: 2, maxLength: 150 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiProperty({ maxLength: 20 })
  @Transform(trim)
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phoneNumber: string;

  @ApiProperty({ example: '150000.00', pattern: '^\\d{1,10}(\\.\\d{1,2})?$' })
  @Transform(trim)
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  @MaxLength(13)
  sessionRate: string;

  @ApiPropertyOptional({ enum: EntityStatus, default: EntityStatus.Active })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}

export class UpdateTutorDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phoneNumber?: string;

  @ApiPropertyOptional({ example: '150000.00' })
  @IsOptional()
  @Transform(trim)
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  @MaxLength(13)
  sessionRate?: string;

  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}

export class TutorsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
