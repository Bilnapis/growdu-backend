import type { DataSource, EntityManager, ObjectLiteral } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import type { PasswordHashService } from '../common/security/password-hash.service.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { UserEntity, UserRole } from '../users/entities/user.entity.js';
import {
  StudentParentSource,
  type CreateStudentRegistrationDto,
  type UpdateStudentRegistrationDto,
} from './dto/student-registration-input.dto.js';
import { StudentParentEntity } from './entities/student-parent.entity.js';
import { StudentEntity, StudentGender } from './entities/student.entity.js';
import { StudentRegistrationService } from './student-registration.service.js';

function transactionDataSource(manager: EntityManager): DataSource {
  return {
    transaction: vi.fn(
      (work: (transactionManager: EntityManager) => Promise<unknown>) =>
        work(manager),
    ),
  } as unknown as DataSource;
}

describe('StudentRegistrationService', () => {
  it('creates the student, parent account, and primary relationship atomically', async () => {
    const savedEntities: ObjectLiteral[] = [];
    const manager = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((entity: new () => ObjectLiteral, input: ObjectLiteral) =>
        Object.assign(new entity(), input),
      ),
      save: vi.fn(async (entity: ObjectLiteral) => {
        if (entity instanceof UserEntity) entity.id = 'user-id';
        if (entity instanceof ParentEntity) entity.id = 'parent-id';
        if (entity instanceof StudentEntity) entity.id = 'student-id';
        savedEntities.push(entity);
        return entity;
      }),
    } as unknown as EntityManager;
    const passwordHashService = {
      hash: vi.fn().mockResolvedValue('hashed-password'),
    } as unknown as PasswordHashService;
    const service = new StudentRegistrationService(
      transactionDataSource(manager),
      passwordHashService,
    );
    const dto: CreateStudentRegistrationDto = {
      name: 'Nadia Putri',
      gender: StudentGender.Female,
      educationLevel: 'SMP Kelas 8',
      school: 'SMP Negeri 2 Bandung',
      phoneNumber: '+6281234567890',
      address: 'Jl. Melati No. 12, Bandung',
      status: EntityStatus.Active,
      parentSource: StudentParentSource.New,
      newParent: {
        name: 'Budi Santoso',
        phoneNumber: '+6281234567890',
        email: 'BUDI@EXAMPLE.COM',
        password: 'strong-password',
      },
    };

    const result = await service.create('tenant-id', dto);

    expect(passwordHashService.hash).toHaveBeenCalledWith('strong-password');
    expect(savedEntities).toHaveLength(4);
    expect(savedEntities[0]).toMatchObject({
      tenantId: 'tenant-id',
      email: 'budi@example.com',
      passwordHash: 'hashed-password',
      role: UserRole.Parent,
    });
    expect(savedEntities[1]).toMatchObject({
      userId: 'user-id',
      name: 'Budi Santoso',
    });
    expect(savedEntities[2]).toMatchObject({
      id: 'student-id',
      name: 'Nadia Putri',
      educationLevel: 'SMP Kelas 8',
    });
    expect(savedEntities[3]).toBeInstanceOf(StudentParentEntity);
    expect(savedEntities[3]).toMatchObject({
      studentId: 'student-id',
      parentId: 'parent-id',
      isPrimary: true,
    });
    expect(result).toMatchObject({
      parentId: 'parent-id',
      student: { id: 'student-id', name: 'Nadia Putri' },
    });
  });

  it('updates the student, primary parent, and parent login email atomically', async () => {
    const student = Object.assign(new StudentEntity(), {
      id: 'student-id',
      tenantId: 'tenant-id',
      studentCode: 'STD-001',
      name: 'Old Student',
      gender: StudentGender.Female,
      educationLevel: 'SMP Kelas 8',
      school: 'Old School',
      phoneNumber: null,
      address: 'Old Address',
      status: EntityStatus.Active,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const relation = Object.assign(new StudentParentEntity(), {
      studentId: student.id,
      parentId: 'parent-id',
      tenantId: 'tenant-id',
      isPrimary: true,
    });
    const parent = Object.assign(new ParentEntity(), {
      id: 'parent-id',
      tenantId: 'tenant-id',
      userId: 'user-id',
      name: 'Old Parent',
      phoneNumber: '+628111111111',
      contactEmail: 'old@example.com',
    });
    const user = Object.assign(new UserEntity(), {
      id: 'user-id',
      tenantId: 'tenant-id',
      email: 'old@example.com',
    });
    const manager = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce(student)
        .mockResolvedValueOnce(relation)
        .mockResolvedValueOnce(parent)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(user),
      save: vi.fn(async (entity: ObjectLiteral) => entity),
    } as unknown as EntityManager;
    const service = new StudentRegistrationService(
      transactionDataSource(manager),
      {} as PasswordHashService,
    );
    const dto: UpdateStudentRegistrationDto = {
      name: 'Nadia Putri',
      school: 'SMP Negeri 2 Bandung',
      parent: {
        name: 'Budi Santoso',
        phoneNumber: '+6281234567890',
        email: 'budi@example.com',
      },
    };

    const result = await service.update('tenant-id', student.id, dto);

    expect(student).toMatchObject({
      name: 'Nadia Putri',
      school: 'SMP Negeri 2 Bandung',
    });
    expect(parent).toMatchObject({
      name: 'Budi Santoso',
      phoneNumber: '+6281234567890',
      contactEmail: 'budi@example.com',
    });
    expect(user.email).toBe('budi@example.com');
    expect(manager.save).toHaveBeenCalledWith(user);
    expect(result).toMatchObject({
      parentId: 'parent-id',
      student: { id: 'student-id', name: 'Nadia Putri' },
    });
  });
});
