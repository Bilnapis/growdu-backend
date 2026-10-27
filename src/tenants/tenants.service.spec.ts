import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { TenantEntity } from './entities/tenant.entity.js';
import { TenantsRepository } from './repositories/tenants.repository.js';
import { TenantLogoStorageService } from './tenant-logo-storage.service.js';
import { TenantsService } from './tenants.service.js';

describe('TenantsService', () => {
  const repository = {
    findById: vi.fn(),
    findActiveByOwnerUserId: vi.fn(),
    updateSettings: vi.fn(),
  };
  const storage = { store: vi.fn() };
  let service: TenantsService;
  let tenant: TenantEntity;

  beforeEach(async () => {
    vi.resetAllMocks();
    tenant = Object.assign(new TenantEntity(), {
      id: 'tenant-id',
      ownerId: 'owner-id',
      name: 'Bimbel Cendekia',
      address: 'Jakarta',
      whatsappNumber: null,
      email: null,
      logoUrl: null,
      websiteUrl: 'https://bimbel.id',
      primaryColor: '#1F8FE5',
      status: EntityStatus.Active,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repository.findById.mockResolvedValue(tenant);
    repository.updateSettings.mockImplementation(
      (_id: string, changes: object) => {
        Object.assign(tenant, changes);
        return Promise.resolve();
      },
    );
    const module = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: TenantsRepository, useValue: repository },
        { provide: TenantLogoStorageService, useValue: storage },
      ],
    }).compile();
    service = module.get(TenantsService);
  });

  it('returns settings for active tenants owned by the user', async () => {
    repository.findActiveByOwnerUserId.mockResolvedValue([tenant]);
    expect(await service.findActiveOwnedByUser('user-id')).toEqual([
      expect.objectContaining({
        id: tenant.id,
        websiteUrl: tenant.websiteUrl,
        primaryColor: tenant.primaryColor,
      }),
    ]);
    expect(repository.findActiveByOwnerUserId).toHaveBeenCalledWith('user-id');
  });

  it('updates only submitted fields, preserving identity when saving theme', async () => {
    expect(
      await service.updateCurrent(tenant.id, {
        primaryColor: '#12B76A',
        name: undefined,
      }),
    ).toMatchObject({
      name: 'Bimbel Cendekia',
      primaryColor: '#12B76A',
      websiteUrl: 'https://bimbel.id',
    });
  });

  it('clears optional values without overwriting theme', async () => {
    expect(
      await service.updateCurrent(tenant.id, {
        websiteUrl: null,
        address: null,
      }),
    ).toMatchObject({
      websiteUrl: null,
      address: null,
      primaryColor: '#1F8FE5',
    });
  });

  it('writes only the submitted columns and skips an empty update', async () => {
    await service.updateCurrent(tenant.id, { primaryColor: '#FFFFFF' });
    expect(repository.updateSettings).toHaveBeenCalledWith(tenant.id, {
      primaryColor: '#FFFFFF',
    });
    repository.updateSettings.mockClear();
    await service.updateCurrent(tenant.id, {});
    expect(repository.updateSettings).not.toHaveBeenCalled();
  });

  it('rejects a missing tenant for read, update and upload', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.findCurrent('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.updateCurrent('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.uploadLogo('missing', undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.store).not.toHaveBeenCalled();
  });

  it('stages an upload with a 2 MB limit without changing the tenant logo', async () => {
    storage.store.mockResolvedValue(
      'https://api.test/uploads/tenant-logos/new.png',
    );
    const file = { buffer: Buffer.from('image'), size: 5 };
    await expect(service.uploadLogo(tenant.id, file)).resolves.toHaveProperty(
      'logoUrl',
    );
    expect(storage.store).toHaveBeenCalledWith(file, 2 * 1024 * 1024);
    expect(repository.updateSettings).not.toHaveBeenCalled();
  });
});
