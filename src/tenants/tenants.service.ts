import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { TenantResponseDto } from './dto/tenant-response.dto.js';
import { TenantsRepository } from './repositories/tenants.repository.js';

@Injectable()
export class TenantsService {
  constructor(private readonly tenantsRepository: TenantsRepository) {}

  async findCurrent(tenantId: string): Promise<TenantResponseDto> {
    const tenant = await this.findEntity(tenantId);
    return TenantResponseDto.fromEntity(tenant);
  }

  async findActiveOwnedByUser(userId: string): Promise<TenantResponseDto[]> {
    const tenants = await this.tenantsRepository.findActiveByOwnerUserId(userId);
    return tenants.map((tenant) => TenantResponseDto.fromEntity(tenant));
  }

  async updateCurrent(
    tenantId: string,
    dto: UpdateTenantDto,
  ): Promise<TenantResponseDto> {
    const tenant = await this.findEntity(tenantId);
    Object.assign(tenant, dto);
    return TenantResponseDto.fromEntity(
      await this.tenantsRepository.save(tenant),
    );
  }

  private async findEntity(tenantId: string) {
    const tenant = await this.tenantsRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }
}
