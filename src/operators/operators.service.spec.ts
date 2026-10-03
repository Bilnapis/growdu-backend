import type { DataSource, EntityManager } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import type { PasswordHashService } from '../common/security/password-hash.service.js';
import type { OwnersService } from '../owners/owners.service.js';
import { UserEntity, UserRole } from '../users/entities/user.entity.js';
import { OperatorsService } from './operators.service.js';
import { OperatorEntity } from './entities/operator.entity.js';
import type { OperatorsRepository } from './repositories/operators.repository.js';

describe('OperatorsService', () => {
  it('creates the login account and operator profile in one transaction', async () => {
    const ownersService = {
      assertOwnsTenant: vi.fn().mockResolvedValue(undefined),
    } as unknown as OwnersService;
    const passwordHashService = {
      hash: vi.fn().mockResolvedValue('password-hash'),
    } as unknown as PasswordHashService;
    const manager = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn(
        <T extends object>(entity: new () => T, input: Partial<T>): T =>
          Object.assign(new entity(), input),
      ),
      save: vi.fn((entity: UserEntity | OperatorEntity) => {
        if (entity instanceof UserEntity) {
          entity.id = 'user-id';
        } else {
          entity.id = 'operator-id';
        }
        return entity;
      }),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: vi.fn(
        (work: (transactionManager: EntityManager) => Promise<unknown>) =>
          work(manager),
      ),
    } as unknown as DataSource;
    const service = new OperatorsService(
      {} as OperatorsRepository,
      ownersService,
      passwordHashService,
      dataSource,
    );

    const result = await service.create('owner-user-id', 'tenant-id', {
      name: 'Operator Test',
      phoneNumber: '081234567890',
      email: 'operator@example.com',
      password: 'secure-password',
    });

    expect(ownersService.assertOwnsTenant).toHaveBeenCalledWith(
      'owner-user-id',
      'tenant-id',
    );
    expect(passwordHashService.hash).toHaveBeenCalledWith('secure-password');
    expect(manager.create).toHaveBeenNthCalledWith(
      1,
      UserEntity,
      expect.objectContaining({
        tenantId: 'tenant-id',
        role: UserRole.Operator,
        status: EntityStatus.Active,
      }),
    );
    expect(manager.create).toHaveBeenNthCalledWith(
      2,
      OperatorEntity,
      expect.objectContaining({
        tenantId: 'tenant-id',
        userId: 'user-id',
      }),
    );
    expect(result).toMatchObject({
      id: 'operator-id',
      userId: 'user-id',
      email: 'operator@example.com',
    });
  });
});
