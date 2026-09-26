import { ConflictException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import type { PasswordHashService } from '../common/security/password-hash.service.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { UserEntity, UserRole } from './entities/user.entity.js';
import type { UsersRepository } from './repositories/users.repository.js';
import { UsersService } from './users.service.js';

function createUser(): UserEntity {
  return Object.assign(new UserEntity(), {
    id: 'user-id',
    tenantId: 'tenant-id',
    email: 'owner@example.com',
    role: UserRole.Owner,
    status: EntityStatus.Active,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('UsersService', () => {
  it('does not deactivate the last active owner', async () => {
    const user = createUser();
    const usersRepository = {
      save: vi.fn(),
    } as unknown as UsersRepository;
    const passwordHashService = {} as PasswordHashService;
    const sessionsRepository = {} as Repository<AuthSessionEntity>;
    const tenant = Object.assign(new TenantEntity(), {
      id: 'tenant-id',
      status: EntityStatus.Active,
    });
    const manager = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce(tenant)
        .mockResolvedValueOnce(user),
      count: vi.fn().mockResolvedValue(1),
      save: vi.fn(),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: vi.fn(
        (work: (transactionManager: EntityManager) => Promise<unknown>) =>
          work(manager),
      ),
    } as unknown as DataSource;
    const service = new UsersService(
      usersRepository,
      passwordHashService,
      sessionsRepository,
      dataSource,
    );

    await expect(
      service.update('tenant-id', 'user-id', {
        status: EntityStatus.Inactive,
      }),
    ).rejects.toThrow(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
