import { ApiProperty } from '@nestjs/swagger';
import { OwnerEntity } from '../../owners/entities/owner.entity.js';
import { TenantResponseDto } from '../../tenants/dto/tenant-response.dto.js';
import { TenantEntity } from '../../tenants/entities/tenant.entity.js';

export class PlatformAdminOwnerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ format: 'email' })
  email: string;

  static fromEntity(owner: OwnerEntity): PlatformAdminOwnerResponseDto {
    return {
      id: owner.id,
      name: owner.name,
      email: owner.user.email,
    };
  }
}

export class PlatformAdminTenantManagementResponseDto extends TenantResponseDto {
  @ApiProperty()
  ownerName: string;

  @ApiProperty({ format: 'email' })
  ownerEmail: string;

  static fromEntity(
    tenant: TenantEntity,
  ): PlatformAdminTenantManagementResponseDto {
    return {
      ...TenantResponseDto.fromEntity(tenant),
      ownerName: tenant.owner.name,
      ownerEmail: tenant.owner.user.email,
    };
  }
}
