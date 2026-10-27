import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { TenantEntity } from '../entities/tenant.entity.js';

export class TenantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  ownerId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  address: string | null;

  @ApiPropertyOptional({ nullable: true })
  whatsappNumber: string | null;

  @ApiPropertyOptional({ nullable: true })
  email: string | null;

  @ApiPropertyOptional({ nullable: true })
  logoUrl: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500, format: 'uri' })
  websiteUrl: string | null;

  @ApiProperty({ example: '#1F8FE5', pattern: '^#[0-9A-F]{6}$' })
  primaryColor: string;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  static fromEntity(entity: TenantEntity): TenantResponseDto {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      name: entity.name,
      address: entity.address,
      whatsappNumber: entity.whatsappNumber,
      email: entity.email,
      logoUrl: entity.logoUrl,
      websiteUrl: entity.websiteUrl,
      primaryColor: entity.primaryColor,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
