import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { PlatformAdminTenantResponseDto } from './platform-admin-tenant-response.dto.js';
import { UserEntity, UserRole } from '../../users/entities/user.entity.js';

export type PlatformAdminUserProfile = {
  id: string;
  name: string;
  phoneNumber: string;
  sessionRate?: string;
};

export class PlatformAdminUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  tenantId: string | null;

  @ApiPropertyOptional({ nullable: true })
  tenantName: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastLoginAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  static fromEntity(user: UserEntity): PlatformAdminUserResponseDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}

export class PlatformAdminUserDetailResponseDto extends PlatformAdminUserResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  phoneNumber: string;

  @ApiPropertyOptional({ nullable: true })
  sessionRate: string | null;

  @ApiProperty({ type: [PlatformAdminTenantResponseDto] })
  ownedTenants: PlatformAdminTenantResponseDto[];

  static fromUserAndProfile(
    user: UserEntity,
    profile: PlatformAdminUserProfile,
    ownedTenants: PlatformAdminTenantResponseDto[] = [],
  ): PlatformAdminUserDetailResponseDto {
    return {
      ...PlatformAdminUserResponseDto.fromEntity(user),
      name: profile.name,
      phoneNumber: profile.phoneNumber,
      sessionRate: profile.sessionRate ?? null,
      ownedTenants,
    };
  }
}
