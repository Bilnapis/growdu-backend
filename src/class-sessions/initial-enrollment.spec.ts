import { Test } from '@nestjs/testing';
import { DataSource, type EntityManager, type ObjectLiteral } from 'typeorm';
import { ClassSessionsService } from './class-sessions.service.js';
import { ConfigurationsService } from './configurations.service.js';
import { StudyGroupConfigurationEntity } from './entities/study-group-configuration.entity.js';
import { ClassSessionEntity } from './entities/class-session.entity.js';
import { ClassSessionStudentEntity } from './entities/class-session-student.entity.js';
import { StudyGroupStudentEntity } from '../study-groups/entities/study-group-student.entity.js';
import { StudentEntity } from '../students/entities/student.entity.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';

describe('initial study group enrollment', () => {
  afterEach(() => vi.useRealTimers());

  async function setup() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T05:00:00Z'));
    const student = Object.assign(new StudentEntity(), {
      id: 'student',
      tenantId: 'tenant',
      name: 'Nadia',
      school: 'SMP',
      educationLevel: 'SMP Kelas 8',
      status: EntityStatus.Active,
    });
    const configs = ['current', 'future'].map((id) =>
      Object.assign(new StudyGroupConfigurationEntity(), { id }),
    );
    const session = (id: string, overrides: Partial<ClassSessionEntity> = {}) =>
      Object.assign(new ClassSessionEntity(), {
        id,
        sessionDate: '2026-11-23',
        startTime: '13:00:00',
        status: 'scheduled',
        version: 1,
        ...overrides,
      });
    const sessions = [
      session('upcoming'),
      session('later-today', { sessionDate: '2026-11-22' }),
      session('started', { sessionDate: '2026-11-22', startTime: '11:00:00' }),
      session('locked', { lockedAt: new Date() }),
      session('completed', { status: 'completed' }),
      session('attendance'),
    ];
    const query = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([{ id: 'attendance' }]),
    };
    const manager = {
      findOneBy: vi.fn().mockResolvedValue({ id: 'group' }),
      find: vi
        .fn()
        .mockImplementation((entity: unknown) =>
          Promise.resolve(
            entity === StudyGroupConfigurationEntity ? configs : sessions,
          ),
        ),
      getRepository: vi
        .fn()
        .mockReturnValue({ createQueryBuilder: () => query }),
      create: vi.fn((entity: new () => ObjectLiteral, input: ObjectLiteral) =>
        Object.assign(new entity(), input),
      ),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const lockTenant = vi.fn().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        ConfigurationsService,
        { provide: DataSource, useValue: {} },
        { provide: ClassSessionsService, useValue: { lockTenant } },
      ],
    }).compile();
    return {
      service: module.get(ConfigurationsService),
      manager,
      student,
      lockTenant,
    };
  }

  it('enrolls in current and future configurations and only untouched upcoming sessions', async () => {
    const { service, manager, student, lockTenant } = await setup();
    await service.enrollNewStudent(
      manager as unknown as EntityManager,
      student,
      'group',
    );
    expect(lockTenant).toHaveBeenCalledWith(manager, 'tenant');
    expect(manager.findOneBy).toHaveBeenCalledWith(expect.anything(), {
      id: 'group',
      tenantId: 'tenant',
      status: EntityStatus.Active,
    });
    expect(manager.save).toHaveBeenCalledWith(StudyGroupStudentEntity, [
      expect.objectContaining({
        configurationId: 'current',
        studentId: 'student',
      }),
      expect.objectContaining({
        configurationId: 'future',
        studentId: 'student',
      }),
    ]);
    const snapshots = manager.save.mock.calls
      .map(([entity]) => entity)
      .filter((entity) => entity instanceof ClassSessionStudentEntity);
    expect(snapshots).toEqual([
      expect.objectContaining({
        sessionId: 'upcoming',
        studentId: 'student',
        name: 'Nadia',
      }),
      expect.objectContaining({
        sessionId: 'later-today',
        studentId: 'student',
      }),
    ]);
  });

  it('rejects missing, inactive or other tenant groups before writing memberships', async () => {
    const { service, manager, student } = await setup();
    manager.findOneBy.mockResolvedValue(null);
    await expect(
      service.enrollNewStudent(
        manager as unknown as EntityManager,
        student,
        'other-group',
      ),
    ).rejects.toThrow('Kelompok aktif tidak ditemukan');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects inactive students and expired configurations', async () => {
    const { service, manager, student } = await setup();
    student.status = EntityStatus.Inactive;
    await expect(
      service.enrollNewStudent(
        manager as unknown as EntityManager,
        student,
        'group',
      ),
    ).rejects.toThrow('Siswa harus aktif');
    student.status = EntityStatus.Active;
    manager.find.mockResolvedValue([]);
    await expect(
      service.enrollNewStudent(
        manager as unknown as EntityManager,
        student,
        'group',
      ),
    ).rejects.toThrow('konfigurasi yang berlaku');
    expect(manager.save).not.toHaveBeenCalled();
  });
});
