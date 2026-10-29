import { NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { MetricsHistoryService } from '../metrics-history/metrics-history.service.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { StudentsQueryDto } from './dto/student-input.dto.js';
import {
  StudentParentEntity,
  ParentRelationship,
} from './entities/student-parent.entity.js';
import { StudentEntity } from './entities/student.entity.js';
import type { StudentsRepository } from './repositories/students.repository.js';
import { StudentsService } from './students.service.js';

function transactionDataSource(manager: EntityManager): DataSource {
  return {
    transaction: vi.fn(
      (work: (transactionManager: EntityManager) => Promise<unknown>) =>
        work(manager),
    ),
  } as unknown as DataSource;
}

describe('StudentsService', () => {
  it('loads primary parents for a page in one batch query', async () => {
    const student = Object.assign(new StudentEntity(), {
      id: 'student-id',
      tenantId: 'tenant-id',
      studentCode: 'STD-001',
      name: 'Nadia Putri',
      gender: 'female',
      educationLevel: 'SMP Kelas 8',
      school: 'SMP Negeri 2 Bandung',
      phoneNumber: null,
      address: 'Bandung',
      status: EntityStatus.Active,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const parent = Object.assign(new ParentEntity(), {
      id: 'parent-id',
      name: 'Budi Santoso',
      phoneNumber: '081234567890',
      contactEmail: 'budi@example.com',
    });
    const relation = Object.assign(new StudentParentEntity(), {
      studentId: student.id,
      parentId: parent.id,
      parent,
      relationship: ParentRelationship.Guardian,
      isPrimary: true,
      accessStatus: EntityStatus.Active,
    });
    const repository = {
      findPage: vi.fn().mockResolvedValue([[student], 1]),
      findPrimaryParentRelations: vi.fn().mockResolvedValue([relation]),
    } as unknown as StudentsRepository;
    const service = new StudentsService(
      repository,
      transactionDataSource({} as EntityManager),
      {} as MetricsHistoryService,
    );
    const query = Object.assign(new StudentsQueryDto(), {
      page: 1,
      limit: 5,
    });

    const result = await service.findAll('tenant-id', query);

    expect(repository.findPrimaryParentRelations).toHaveBeenCalledWith(
      'tenant-id',
      ['student-id'],
    );
    expect(result.data[0]).toMatchObject({
      id: 'student-id',
      primaryParent: {
        parentId: 'parent-id',
        parentName: 'Budi Santoso',
      },
    });
  });

  it('rejects a parent from outside the authenticated tenant', async () => {
    const student = Object.assign(new StudentEntity(), {
      id: 'student-id',
      tenantId: 'tenant-id',
    });
    const manager = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce(student)
        .mockResolvedValueOnce(null),
      save: vi.fn(),
    } as unknown as EntityManager;
    const service = new StudentsService(
      {} as StudentsRepository,
      transactionDataSource(manager),
      {} as MetricsHistoryService,
    );

    await expect(
      service.addParent('tenant-id', 'student-id', {
        parentId: 'other-tenant-parent-id',
        relationship: ParentRelationship.Guardian,
        isPrimary: false,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('demotes the previous primary parent in the same transaction', async () => {
    const student = Object.assign(new StudentEntity(), {
      id: 'student-id',
      tenantId: 'tenant-id',
    });
    const parent = Object.assign(new ParentEntity(), {
      id: 'parent-id',
      tenantId: 'tenant-id',
      name: 'Primary Parent',
      phoneNumber: '081234567890',
      contactEmail: 'parent@example.com',
    });
    const relation = Object.assign(new StudentParentEntity(), {
      tenantId: 'tenant-id',
      studentId: student.id,
      parentId: parent.id,
      parent,
      relationship: ParentRelationship.Mother,
      isPrimary: true,
      accessStatus: EntityStatus.Active,
    });
    const execute = vi.fn().mockResolvedValue({ affected: 1 });
    const andWhere = vi.fn().mockReturnThis();
    const where = vi.fn().mockReturnThis();
    const set = vi.fn().mockReturnThis();
    const update = vi.fn().mockReturnThis();
    const manager = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce(student)
        .mockResolvedValueOnce(parent)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(relation),
      createQueryBuilder: vi.fn(() => ({
        update,
        set,
        where,
        andWhere,
        execute,
      })),
      create: vi.fn().mockReturnValue(relation),
      save: vi.fn().mockResolvedValue(relation),
    } as unknown as EntityManager;
    const service = new StudentsService(
      {} as StudentsRepository,
      transactionDataSource(manager),
      {} as MetricsHistoryService,
    );

    const result = await service.addParent('tenant-id', student.id, {
      parentId: parent.id,
      relationship: ParentRelationship.Mother,
      isPrimary: true,
    });

    expect(set).toHaveBeenCalledWith({ isPrimary: false });
    expect(where).toHaveBeenCalledWith('tenant_id = :tenantId', {
      tenantId: 'tenant-id',
    });
    expect(andWhere).toHaveBeenCalledWith('student_id = :studentId', {
      studentId: student.id,
    });
    expect(result).toMatchObject({
      parentId: parent.id,
      isPrimary: true,
      relationship: ParentRelationship.Mother,
    });
  });
});
