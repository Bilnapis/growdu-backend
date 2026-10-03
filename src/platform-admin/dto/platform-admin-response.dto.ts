import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { PlatformAdminEntity } from '../entities/platform-admin.entity.js';

export class PlatformAdminResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastLoginAt: Date | null;

  static fromEntity(entity: PlatformAdminEntity): PlatformAdminResponseDto {
    return {
      id: entity.id,
      email: entity.email,
      status: entity.status,
      lastLoginAt: entity.lastLoginAt,
    };
  }
}

export class PlatformAdminTokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: 900 })
  expiresIn: number;

  @ApiProperty({ type: PlatformAdminResponseDto })
  admin: PlatformAdminResponseDto;
}
