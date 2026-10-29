import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/app.setup.js';
import { EntityStatus } from '../src/common/enums/entity-status.enum.js';
import { PasswordHashService } from '../src/common/security/password-hash.service.js';
import { MetricStatusHistoryEntity } from '../src/metrics-history/entities/metric-status-history.entity.js';
import { MetricsHistoryService } from '../src/metrics-history/metrics-history.service.js';
import { OwnerEntity } from '../src/owners/entities/owner.entity.js';
import {
  StudentEntity,
  StudentGender,
} from '../src/students/entities/student.entity.js';
import { StudyGroupEntity } from '../src/study-groups/entities/study-group.entity.js';
import { jakartaDate } from '../src/class-sessions/session-dates.js';
import { TenantEntity } from '../src/tenants/entities/tenant.entity.js';
import { TutorEntity } from '../src/tutors/entities/tutor.entity.js';
import { UserEntity, UserRole } from '../src/users/entities/user.entity.js';

const password = 'MetricPassword!123';

describe('Metric history (e2e)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let history: MetricsHistoryService;
  let ownerId: string;
  let token: string;
  let code = 0;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
    });
    configureApplication(app);
    await app.init();
    db = app.get(DataSource);
    history = app.get(MetricsHistoryService);
    const user = await db.manager.save(
      db.manager.create(UserEntity, {
        email: 'metric-history-owner@example.com',
        passwordHash: await app.get(PasswordHashService).hash(password),
        tenantId: null,
        role: UserRole.Owner,
        status: EntityStatus.Active,
      }),
    );
    const owner = await db.manager.save(
      db.manager.create(OwnerEntity, {
        userId: user.id,
        name: 'Metric owner',
        phoneNumber: '081234567890',
        status: EntityStatus.Active,
      }),
    );
    ownerId = owner.id;
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(200);
    token = login.body.accessToken as string;
  });
  afterAll(async () => {
    await app?.close();
  });

  async function tenant() {
    return db.manager.save(
      db.manager.create(TenantEntity, {
        ownerId,
        name: 'Metric tenant',
        status: EntityStatus.Active,
      }),
    );
  }
  async function student(tenantId: string) {
    return db.manager.save(
      db.manager.create(StudentEntity, {
        tenantId,
        studentCode: `METRIC-${++code}`,
        name: 'Metric student',
        gender: StudentGender.Female,
        educationLevel: 'SMP',
        school: 'School',
        address: 'Jakarta',
        status: EntityStatus.Active,
      }),
    );
  }
  async function tutor(tenantId: string) {
    return db.manager.save(
      db.manager.create(TutorEntity, {
        tenantId,
        name: 'Metric tutor',
        phoneNumber: '081234567891',
        sessionRate: '0.00',
        status: EntityStatus.Active,
      }),
    );
  }
  async function latestDate(tenantId: string, entityId: string, date: string) {
    const repository = db.getRepository(MetricStatusHistoryEntity);
    const latest = await repository.findOneOrFail({
      where: { tenantId, entityId },
      order: { id: 'DESC' },
    });
    await repository.update(latest.id, { recordedAt: new Date(date) });
  }

  it('records status changes atomically and ignores profile-only updates', async () => {
    const selected = await tenant();
    const item = await student(selected.id);
    const events = () =>
      db
        .getRepository(MetricStatusHistoryEntity)
        .find({ where: { tenantId: selected.id }, order: { id: 'ASC' } });
    expect((await events()).map((event) => event.status)).toEqual(['active']);
    item.name = 'Changed name';
    await db.manager.save(item);
    expect(await events()).toHaveLength(1);
    item.status = EntityStatus.Inactive;
    await db.manager.save(item);
    expect((await events()).map((event) => event.status)).toEqual([
      'active',
      'inactive',
    ]);
    await expect(
      db.transaction(async (manager) => {
        await manager.update(StudentEntity, item.id, {
          status: EntityStatus.Active,
        });
        throw new Error('rollback fixture');
      }),
    ).rejects.toThrow('rollback fixture');
    expect(await events()).toHaveLength(2);
    expect(
      (await db.manager.findOneByOrFail(StudentEntity, { id: item.id })).status,
    ).toBe(EntityStatus.Inactive);
  });

  it('records transfers between tenants and deletions for tutors', async () => {
    const source = await tenant();
    const target = await tenant();
    const item = await tutor(source.id);
    item.tenantId = target.id;
    await db.manager.save(item);
    const repository = db.getRepository(MetricStatusHistoryEntity);
    expect(
      (
        await repository.find({
          where: { tenantId: source.id, entityId: item.id },
          order: { id: 'ASC' },
        })
      ).map((event) => event.status),
    ).toEqual(['active', 'inactive']);
    await db.manager.remove(item);
    expect(
      (
        await repository.find({
          where: { tenantId: target.id },
          order: { id: 'ASC' },
        })
      ).map((event) => event.status),
    ).toEqual(['active', 'inactive']);
  });

  it('reconstructs the last status before midnight WIB despite later changes, repeated changes and equal timestamps', async () => {
    const selected = await tenant();
    const foreign = await tenant();
    const first = await student(selected.id);
    await latestDate(selected.id, first.id, '2090-02-01T00:00:00+07:00');
    first.status = EntityStatus.Inactive;
    await db.manager.save(first);
    await latestDate(selected.id, first.id, '2090-02-10T00:00:00+07:00');
    first.status = EntityStatus.Active;
    await db.manager.save(first);
    await latestDate(selected.id, first.id, '2090-02-20T00:00:00+07:00');
    first.status = EntityStatus.Inactive;
    await db.manager.save(first);
    await latestDate(selected.id, first.id, '2090-03-01T00:00:00+07:00');

    const second = await student(selected.id);
    await latestDate(selected.id, second.id, '2090-02-15T00:00:00+07:00');
    second.status = EntityStatus.Inactive;
    await db.manager.save(second);
    await latestDate(selected.id, second.id, '2090-02-15T00:00:00+07:00');
    const third = await student(selected.id);
    await latestDate(selected.id, third.id, '2090-03-01T00:00:00+07:00');
    await student(foreign.id);
    await tutor(selected.id);
    const now = new Date('2090-03-01T00:01:00+07:00');
    await expect(
      history.getPreviousMonthActive(selected.id, 'student', now),
    ).resolves.toBe(1);
    await expect(
      history.getPreviousMonthActive(selected.id, 'tutor', now),
    ).resolves.toBe(1);
    const empty = await tenant();
    await expect(
      history.getPreviousMonthActive(empty.id, 'student', now),
    ).resolves.toBe(0);
  });

  it('exposes guarded, tenant-scoped summaries and marks pre-tracking history unavailable', async () => {
    const selected = await tenant();
    await student(selected.id);
    await tutor(selected.id);
    const foreign = await tenant();
    await student(foreign.id);
    await tutor(foreign.id);
    for (const resource of ['students', 'tutors']) {
      const path = `/api/v1/${resource}/summary`;
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .auth(token, { type: 'bearer' })
        .expect(403);
      const response = await request(app.getHttpServer())
        .get(path)
        .auth(token, { type: 'bearer' })
        .set('X-Tenant-Id', selected.id)
        .expect(200);
      expect(response.body).toMatchObject({
        active: 1,
        previousMonthActive: null,
      });
    }
  });

  it('counts groups created before the month boundary separately from this month and other tenants', async () => {
    const selected = await tenant();
    const foreign = await tenant();
    const today = jakartaDate();
    const boundary = new Date(`${today.slice(0, 7)}-01T00:00:00+07:00`);
    const before = new Date(boundary.getTime() - 1);
    await db.manager.save(StudyGroupEntity, [
      {
        tenantId: selected.id,
        name: 'Prior active',
        status: EntityStatus.Active,
        createdAt: before,
      },
      {
        tenantId: selected.id,
        name: 'Prior inactive',
        status: EntityStatus.Inactive,
        createdAt: before,
      },
      {
        tenantId: selected.id,
        name: 'Current month',
        status: EntityStatus.Active,
        createdAt: boundary,
      },
      {
        tenantId: foreign.id,
        name: 'Other tenant',
        status: EntityStatus.Active,
        createdAt: before,
      },
    ]);
    const response = await request(app.getHttpServer())
      .get('/api/v1/study-groups/summary')
      .auth(token, { type: 'bearer' })
      .set('X-Tenant-Id', selected.id)
      .expect(200);
    expect(response.body).toMatchObject({ total: 3, previousMonthTotal: 2 });
  });
});
