import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, type EntityManager } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import { OwnersService } from '../owners/owners.service.js';
import { UserEntity, UserRole } from '../users/entities/user.entity.js';
import { OperatorsService } from './operators.service.js';
import { OperatorEntity } from './entities/operator.entity.js';
import { OperatorsRepository } from './repositories/operators.repository.js';

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
      address: 'Jl. Melati 12',
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
      address: 'Jl. Melati 12',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('password');
  });
});

describe('OperatorsService create failures', () => {
  const input = {
    name: 'Pegawai',
    phoneNumber: '081234567890',
    email: 'staff@example.com',
    password: 'StrongPassword123!',
  };

  async function setup() {
    const owners = { assertOwnsTenant: vi.fn().mockResolvedValue(undefined) };
    const manager = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn(<T extends object>(entity: new () => T, data: Partial<T>) =>
        Object.assign(new entity(), data),
      ),
      save: vi.fn().mockRejectedValue({ code: 'ER_DUP_ENTRY', errno: 1062 }),
    };
    const dataSource = {
      transaction: vi.fn(
        (work: (transactionManager: typeof manager) => Promise<unknown>) =>
          work(manager),
      ),
    };
    const module = await Test.createTestingModule({
      providers: [
        OperatorsService,
        { provide: OperatorsRepository, useValue: {} },
        { provide: OwnersService, useValue: owners },
        {
          provide: PasswordHashService,
          useValue: { hash: vi.fn().mockResolvedValue('hash') },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    return {
      service: module.get(OperatorsService),
      owners,
      manager,
      dataSource,
    };
  }

  it('rejects a different owner before attempting writes', async () => {
    const { service, owners, dataSource } = await setup();
    owners.assertOwnsTenant.mockRejectedValue(new NotFoundException());
    await expect(
      service.create('other-owner', 'tenant', input),
    ).rejects.toThrow(NotFoundException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects an already registered email without saving', async () => {
    const { service, manager } = await setup();
    manager.findOne.mockResolvedValue(
      Object.assign(new UserEntity(), { email: input.email }),
    );
    await expect(service.create('owner', 'tenant', input)).rejects.toThrow(
      ConflictException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('translates a concurrent duplicate insert to a conflict', async () => {
    const { service } = await setup();
    await expect(service.create('owner', 'tenant', input)).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('OperatorsService update', () => {
  it('hashes a replacement password and revokes active sessions', async () => {
    const ownersService = {
      assertOwnsTenant: vi.fn().mockResolvedValue(undefined),
    } as unknown as OwnersService;
    const passwordHashService = {
      hash: vi.fn().mockResolvedValue('replacement-password-hash'),
    } as unknown as PasswordHashService;
    const user = Object.assign(new UserEntity(), {
      id: 'user-id',
      tenantId: 'tenant-id',
      email: 'operator@example.com',
      passwordHash: 'previous-password-hash',
      role: UserRole.Operator,
      status: EntityStatus.Active,
    });
    const operator = Object.assign(new OperatorEntity(), {
      id: 'operator-id',
      tenantId: 'tenant-id',
      userId: user.id,
      name: 'Operator Test',
      phoneNumber: '+6281234567890',
      status: EntityStatus.Active,
      user,
    });
    const sessionQuery = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const manager = {
      findOne: vi.fn().mockResolvedValue(operator),
      save: vi.fn((entity: UserEntity | OperatorEntity) => entity),
      createQueryBuilder: vi.fn().mockReturnValue(sessionQuery),
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

    await service.update('owner-id', 'tenant-id', 'operator-id', {
      password: 'new-secure-password',
    });

    expect(passwordHashService.hash).toHaveBeenCalledWith('new-secure-password');
    expect(user.passwordHash).toBe('replacement-password-hash');
    expect(sessionQuery.update).toHaveBeenCalled();
    expect(sessionQuery.execute).toHaveBeenCalled();
  });
});
