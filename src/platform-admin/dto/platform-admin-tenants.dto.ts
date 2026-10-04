import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { UpdateTenantDto } from '../../tenants/dto/update-tenant.dto.js';
import { IsTenantLogoUrl } from '../../tenants/dto/tenant-logo-url.validator.js';

function trimNullable(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class PlatformAdminCreateTenantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  ownerId: string;

  @ApiProperty({ minLength: 2, maxLength: 150 })
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsString()
  @MaxLength(5_000)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 20 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsString()
  @MaxLength(20)
  whatsappNumber?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 150 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 500,
    description: 'URL HTTP(S) atau path logo internal hasil upload',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsTenantLogoUrl()
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional({ enum: EntityStatus, default: EntityStatus.Active })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}

export class PlatformAdminUpdateTenantDto extends UpdateTenantDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  ownerId?: string;
}

export class PlatformAdminTenantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
