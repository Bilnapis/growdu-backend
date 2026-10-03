import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { TenantEntity } from '../../tenants/entities/tenant.entity.js';

export class PlatformAdminTenantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;

  static fromEntity(tenant: TenantEntity): PlatformAdminTenantResponseDto {
    return { id: tenant.id, name: tenant.name, status: tenant.status };
  }
}
