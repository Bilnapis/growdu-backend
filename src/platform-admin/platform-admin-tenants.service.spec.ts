import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { OwnerEntity } from '../owners/entities/owner.entity.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { PlatformAdminTenantsService } from './platform-admin-tenants.service.js';

describe('PlatformAdminTenantsService', () => {
  it('creates a tenant for an active owner', async () => {
    const owner = createOwner();
    const tenant = Object.assign(new TenantEntity(), {
      id: 'tenant-id',
      ownerId: owner.id,
      owner,
      name: 'Bimbel Cerdas',
      address: null,
      whatsappNumber: null,
      email: null,
      logoUrl: null,
      status: EntityStatus.Active,
      createdAt: new Date('2026-10-03T00:00:00Z'),
      updatedAt: new Date('2026-10-03T00:00:00Z'),
    });
    const tenantsRepository = {
      create: vi.fn().mockReturnValue(tenant),
      save: vi.fn().mockResolvedValue(tenant),
    } as unknown as Repository<TenantEntity>;
    const ownersRepository = {
      findOne: vi.fn().mockResolvedValue(owner),
    } as unknown as Repository<OwnerEntity>;
    const service = new PlatformAdminTenantsService(
      tenantsRepository,
      ownersRepository,
    );

    const result = await service.create({
      ownerId: owner.id,
      name: tenant.name,
      status: EntityStatus.Active,
    });

    expect(result).toMatchObject({
      id: tenant.id,
      name: tenant.name,
      ownerName: owner.name,
      ownerEmail: owner.user.email,
    });
    expect(tenantsRepository.create).toHaveBeenCalledWith({
      ownerId: owner.id,
      name: tenant.name,
      address: null,
      whatsappNumber: null,
      email: null,
      logoUrl: null,
      status: EntityStatus.Active,
    });
  });

  it('rejects tenant creation when the selected owner is not active', async () => {
    const tenantsRepository = {
      create: vi.fn(),
    } as unknown as Repository<TenantEntity>;
    const ownersRepository = {
      findOne: vi.fn().mockResolvedValue(null),
    } as unknown as Repository<OwnerEntity>;
    const service = new PlatformAdminTenantsService(
      tenantsRepository,
      ownersRepository,
    );

    await expect(
      service.create({
        ownerId: '11dc271c-b0a6-4db8-9827-c550597b9d4f',
        name: 'Bimbel Cerdas',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tenantsRepository.create).not.toHaveBeenCalled();
  });
});

function createOwner() {
  return Object.assign(new OwnerEntity(), {
    id: '85e9b7cf-b41a-488d-9d8c-0fe2e08be01e',
    name: 'Pemilik Bimbel',
    status: EntityStatus.Active,
    user: { email: 'owner@bimbel.test' },
  });
}
