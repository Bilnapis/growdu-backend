import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeCode = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLocaleUpperCase('id-ID') : value;

export enum RoomCapacityCategory {
  Small = 'small',
  Medium = 'medium',
  Large = 'large',
}

export class CreateRoomDto {
  @ApiProperty({ minLength: 2, maxLength: 150, example: 'Ruang Galileo' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiProperty({ minLength: 1, maxLength: 30, example: 'R-01' })
  @Transform(normalizeCode)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code: string;

  @ApiProperty({ minimum: 1, maximum: 65_535, example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  capacity: number;
}

export class UpdateRoomDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 30 })
  @IsOptional()
  @Transform(normalizeCode)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 65_535 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  capacity?: number;
}

export class UpdateRoomStatusDto {
  @ApiProperty({ enum: EntityStatus })
  @IsEnum(EntityStatus)
  status: EntityStatus;
}

export class RoomsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @ApiPropertyOptional({ enum: RoomCapacityCategory })
  @IsOptional()
  @IsEnum(RoomCapacityCategory)
  capacityCategory?: RoomCapacityCategory;
}
