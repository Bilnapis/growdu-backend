import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsEnum,
  IsUrl,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { IsTenantLogoUrl } from './tenant-logo-url.validator.js';

function trimNullable(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 150 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

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

  @ApiPropertyOptional({ nullable: true, maxLength: 500, format: 'uri' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsString()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    disallow_auth: true,
  })
  @MaxLength(500)
  websiteUrl?: string | null;

  @ApiPropertyOptional({ example: '#1F8FE5', pattern: '^#[0-9A-Fa-f]{6}$' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^#[0-9A-F]{6}$/)
  primaryColor?: string;

  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
