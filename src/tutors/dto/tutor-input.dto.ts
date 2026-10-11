import { Transform } from 'class-transformer';
import {
  IsDecimal,
  IsEmail,
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

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ maxLength: 5_000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5_000)
  address?: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'Matematika' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  expertise?: string;

  @ApiPropertyOptional({ maxLength: 150, example: 'Pendidikan Matematika' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  education?: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'BCA' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  accountName?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  accountNumber?: string;

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

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ maxLength: 5_000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5_000)
  address?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  expertise?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  education?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  accountName?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  accountNumber?: string;

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

export class TutorFormOptionsDto {
  @ApiProperty({ type: [String] })
  expertiseOptions: string[];

  @ApiProperty({ type: [String] })
  educationOptions: string[];

  @ApiProperty({ type: [String] })
  bankOptions: string[];
}

export class TutorsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
