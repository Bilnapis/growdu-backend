import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { TenantEntity } from './entities/tenant.entity.js';
import type { TenantsRepository } from './repositories/tenants.repository.js';
import { TenantsService } from './tenants.service.js';

describe('TenantsService', () => {
  it('returns active tenants owned by the authenticated user', async () => {
    const tenant = Object.assign(new TenantEntity(), {
      id: 'tenant-id',
      ownerId: 'owner-id',
      name: 'Bimbel Cendekia',
      address: 'Jakarta',
      whatsappNumber: null,
      email: null,
      logoUrl: null,
      status: EntityStatus.Active,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const tenantsRepository = {
      findActiveByOwnerUserId: vi.fn().mockResolvedValue([tenant]),
    } as unknown as TenantsRepository;
    const service = new TenantsService(tenantsRepository);

    const result = await service.findActiveOwnedByUser('user-id');

    expect(tenantsRepository.findActiveByOwnerUserId).toHaveBeenCalledWith(
      'user-id',
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: tenant.id,
        name: tenant.name,
        status: EntityStatus.Active,
      }),
    ]);
  });
});
