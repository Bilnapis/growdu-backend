import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { TenantResponseDto } from './dto/tenant-response.dto.js';
import { TenantsRepository } from './repositories/tenants.repository.js';
import {
  TenantLogoStorageService,
  type TenantLogoUpload,
} from './tenant-logo-storage.service.js';

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly logoStorage: TenantLogoStorageService,
  ) {}

  async uploadLogo(
    tenantId: string,
    file: TenantLogoUpload | undefined,
  ): Promise<{ logoUrl: string }> {
    await this.findEntity(tenantId);
    return { logoUrl: await this.logoStorage.store(file, 2 * 1024 * 1024) };
  }

  async findCurrent(tenantId: string): Promise<TenantResponseDto> {
    const tenant = await this.findEntity(tenantId);
    return TenantResponseDto.fromEntity(tenant);
  }

  async findActiveOwnedByUser(userId: string): Promise<TenantResponseDto[]> {
    const tenants =
      await this.tenantsRepository.findActiveByOwnerUserId(userId);
    return tenants.map((tenant) => TenantResponseDto.fromEntity(tenant));
  }

  async updateCurrent(
    tenantId: string,
    dto: UpdateTenantDto,
  ): Promise<TenantResponseDto> {
    await this.findEntity(tenantId);
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length > 0) {
      await this.tenantsRepository.updateSettings(tenantId, changes);
    }
    return this.findCurrent(tenantId);
  }

  private async findEntity(tenantId: string) {
    const tenant = await this.tenantsRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }
}
