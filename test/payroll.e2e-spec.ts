import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/app.setup.js';
import { PasswordHashService } from '../src/common/security/password-hash.service.js';
import { jakartaDate, shiftCalendarDate } from '../src/common/jakarta-date.js';
import { OwnerEntity } from '../src/owners/entities/owner.entity.js';
import { OperatorEntity } from '../src/operators/entities/operator.entity.js';
import { OperatorMenu } from '../src/operators/menu-permissions.js';
import { TenantEntity } from '../src/tenants/entities/tenant.entity.js';
import { TutorEntity } from '../src/tutors/entities/tutor.entity.js';
import { UserEntity, UserRole } from '../src/users/entities/user.entity.js';
import { EntityStatus } from '../src/common/enums/entity-status.enum.js';
import { ClassSessionEntity } from '../src/class-sessions/entities/class-session.entity.js';
import { ClassSessionStudentEntity } from '../src/class-sessions/entities/class-session-student.entity.js';
import { StudentEntity } from '../src/students/entities/student.entity.js';
import {
  PayrollEntity,
  PayrollPaymentEntity,
  PayrollPeriodEntity,
} from '../src/payroll/entities/payroll.entity.js';
import { PayrollPeriodsService } from '../src/payroll/payroll-periods.service.js';
import { PayrollGenerationService } from '../src/payroll/payroll-generation.service.js';
import { PayrollAutomationService } from '../src/payroll/payroll-automation.service.js';
import type { PayrollDetailResponseDto } from '../src/payroll/dto/payroll-response.dto.js';
import { CreatePayroll20261116000000 } from '../src/database/migrations/20261116000000-CreatePayroll.js';
import { firstCycle, monthOffset } from '../src/payroll/payroll-rules.js';

describe('Payroll API (MySQL)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let directory: string;
  let ownerId: string;
  let ownerToken: string;
  let passwordHash: string;
  const password = 'payroll-e2e-password';
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
    'base64',
  );
  const api = () => request(app.getHttpServer());
  const auth = (token: string, tenantId: string) => ({
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
  });
  const login = async (email: string) =>
    (
      await api()
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200)
    ).body.accessToken as string;
  const detail = async (
    tenantId: string,
    id: string,
  ): Promise<PayrollDetailResponseDto> =>
    (
      await api()
        .get(`/api/v1/payroll/${id}`)
        .set(auth(ownerToken, tenantId))
        .expect(200)
    ).body;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'growdu-payroll-e2e-'));
    process.env.PAYROLL_PROOF_STORAGE_PATH = directory;
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
      abortOnError: false,
    });
    configureApplication(app);
    await app.init();
    db = app.get(DataSource);
    passwordHash = await app.get(PasswordHashService).hash(password);
    const user = await db.manager.save(UserEntity, {
      email: `payroll-owner-${randomUUID()}@example.com`,
      passwordHash,
      role: UserRole.Owner,
      tenantId: null,
      status: EntityStatus.Active,
    });
    const owner = await db.manager.save(OwnerEntity, {
      userId: user.id,
      name: 'Payroll Owner',
      phoneNumber: '081234567890',
      status: EntityStatus.Active,
    });
    ownerId = owner.id;
    ownerToken = await login(user.email);
  });
  afterAll(async () => {
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function scenario(
    now = new Date(),
    payday = Number(jakartaDate(now).slice(8)),
  ) {
    const tenant = await db.manager.save(TenantEntity, {
      ownerId,
      name: 'Payroll Bimbel',
      address: 'Bandung',
      status: EntityStatus.Active,
    });
    const tutorUser = await db.manager.save(UserEntity, {
      tenantId: tenant.id,
      email: `payroll-tutor-${randomUUID()}@example.com`,
      passwordHash,
      role: UserRole.Tutor,
      status: EntityStatus.Active,
    });
    const tutor = await db.manager.save(TutorEntity, {
      tenantId: tenant.id,
      userId: tutorUser.id,
      name: 'Riza Payroll',
      phoneNumber: '081234567891',
      email: tutorUser.email,
      sessionRate: '50000.25',
      expertise: 'Matematika',
      bankName: 'BCA',
      accountName: 'Riza',
      accountNumber: '1234567890',
      status: EntityStatus.Active,
    });
    const student = await db.manager.save(StudentEntity, {
      tenantId: tenant.id,
      studentCode: randomUUID().slice(0, 8),
      name: 'Payroll Student',
      gender: 'male',
      educationLevel: 'SMA',
      school: 'SMA',
      address: 'Bandung',
      administrativeStatus: EntityStatus.Active,
      status: EntityStatus.Active,
    });
    const settings = await app.get(PayrollPeriodsService).update(
      tenant.id,
      {
        payday,
        enabled: false,
      },
      now,
    );
    const period = settings.nextPeriod;
    if (!period) throw new Error('Missing fixture payroll period');
    const groups = [] as { id: string; configuration: string; rule: string }[];
    for (const name of ['Alpha', 'Beta']) {
      const [id, configuration, rule] = [
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ];
      await db.query(
        'INSERT INTO study_groups (id,tenant_id,name) VALUES (?,?,?)',
        [id, tenant.id, name],
      );
      await db.query(
        'INSERT INTO study_group_configurations (id,tenant_id,study_group_id,effective_from,effective_until) VALUES (?,?,?,?,?)',
        [
          configuration,
          tenant.id,
          id,
          period.startDate,
          shiftCalendarDate(period.payDate, 100),
        ],
      );
      await db.query(
        "INSERT INTO study_group_schedules (id,tenant_id,study_group_id,tutor_id,day_of_week,start_time,end_time,sort_order,configuration_id,series_id) VALUES (?,?,?,?,1,'08:00','09:00',0,?,?)",
        [rule, tenant.id, id, tutor.id, configuration, rule],
      );
      groups.push({ id, configuration, rule });
    }
    async function session(
      groupIndex: number,
      date = period!.endDate,
      status: 'completed' | 'scheduled' | 'cancelled' = 'completed',
      tutorId = tutor.id,
    ) {
      const group = groups[groupIndex];
      const row = await db.manager.save(ClassSessionEntity, {
        tenantId: tenant.id,
        studyGroupId: group.id,
        configurationId: group.configuration,
        scheduleRuleId: group.rule,
        seriesId: randomUUID(),
        sessionDate: date,
        occurrenceDate: date,
        startTime: '08:00',
        endTime: '09:00',
        tutorId,
        roomId: null,
        studyGroupName: groupIndex ? 'Beta' : 'Alpha',
        subject: 'Matematika',
        status,
        topic: status === 'completed' ? 'Aljabar' : null,
        completedAt: status === 'completed' ? new Date() : null,
        completedBy: status === 'completed' ? tutorUser.id : null,
        lockedAt: null,
        lockReason: null,
        version: 1,
      });
      await db.manager.save(ClassSessionStudentEntity, {
        sessionId: row.id,
        studentId: student.id,
        name: student.name,
        school: student.school,
        educationLevel: student.educationLevel,
        status: status === 'completed' ? 'absent' : null,
      });
      return row;
    }
    const sessions = [
      await session(0, period.startDate),
      await session(0),
      await session(1),
    ];
    const headers = auth(ownerToken, tenant.id);
    const generate = () =>
      api()
        .post('/api/v1/payroll/generations')
        .set(headers)
        .send({ periodId: period.id });
    return {
      tenant,
      tutor,
      tutorUser,
      student,
      period,
      groups,
      session,
      sessions,
      headers,
      generate,
    };
  }

  it('initializes payday 1 and automatic generation once without requiring manual setup', async () => {
    const tenant = await db.manager.save(TenantEntity, {
      ownerId,
      name: 'Default Payroll',
      status: EntityStatus.Active,
    });
    const headers = auth(ownerToken, tenant.id);
    const [settings, periods] = await Promise.all([
      api().get('/api/v1/payroll/settings').set(headers).expect(200),
      api().get('/api/v1/payroll/periods').set(headers).expect(200),
    ]);
    expect(settings.body).toMatchObject({
      payday: 1,
      enabled: true,
      configured: true,
    });
    expect(periods.body).toHaveLength(1);
    expect(periods.body[0]).toMatchObject(firstCycle(jakartaDate(), 1));
    expect(
      await db.manager.countBy(PayrollPeriodEntity, { tenantId: tenant.id }),
    ).toBe(1);
    await api()
      .patch('/api/v1/payroll/settings')
      .set(headers)
      .send({ payday: 12, enabled: false })
      .expect(200);
    const customized = await api()
      .get('/api/v1/payroll/settings')
      .set(headers)
      .expect(200);
    expect(customized.body).toMatchObject({
      payday: 12,
      enabled: false,
      configured: true,
    });
  });

  it('generates once under concurrency, counts sessions rather than students, and preserves source ownership', async () => {
    const s = await scenario();
    await s.session(0, shiftCalendarDate(s.period.startDate, -1));
    await s.session(0, shiftCalendarDate(s.period.endDate, 1));
    await s.session(0, s.period.endDate, 'scheduled');
    await s.session(0, s.period.endDate, 'cancelled');
    const missing = await db.manager.save(TutorEntity, {
      tenantId: s.tenant.id,
      name: 'Missing Rate',
      phoneNumber: '081234567892',
      sessionRate: '0',
      status: EntityStatus.Active,
    });
    await s.session(0, s.period.endDate, 'completed', missing.id);
    await db.manager.save(TutorEntity, {
      tenantId: s.tenant.id,
      name: 'No Sessions',
      phoneNumber: '081234567893',
      sessionRate: '10000',
      status: EntityStatus.Active,
    });
    await db.manager.update(TutorEntity, s.tutor.id, {
      status: EntityStatus.Inactive,
    });
    const responses = await Promise.all([
      s.generate().expect(201),
      s.generate().expect(201),
    ]);
    expect(responses.reduce((sum, r) => sum + r.body.created, 0)).toBe(1);
    expect(responses[0].body.skippedMissingRate).toBe(1);
    expect(responses[0].body.skippedNoSessions).toBe(1);
    const p = await db.manager.findOneByOrFail(PayrollEntity, {
      tenantId: s.tenant.id,
      tutorId: s.tutor.id,
    });
    const d = await detail(s.tenant.id, p.id);
    expect(d.totalSessions).toBe(3);
    expect(d.total).toBe('150000.75');
    expect(d.items).toHaveLength(2);
    expect(d.items.map((i) => i.sourceCount).sort()).toEqual([1, 2]);
    const list = await api()
      .get('/api/v1/payroll')
      .query({
        tutorId: s.tutor.id,
        month: s.period.payDate.slice(0, 7),
        search: 'Riza',
      })
      .set(s.headers)
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    const csv = await api()
      .get('/api/v1/payroll/export')
      .set(s.headers)
      .expect(200);
    expect(csv.text).toContain(p.number);
    await db.manager.update(TutorEntity, missing.id, {
      sessionRate: '10000.00',
    });
    expect((await s.generate().expect(201)).body.created).toBe(1);
    const next = await db.manager.findOneOrFail(PayrollPeriodEntity, {
      where: { tenantId: s.tenant.id },
      order: { payDate: 'DESC' },
    });
    expect(next.startDate).toBe(`${s.period.payDate.slice(0, 7)}-01`);
    await api()
      .post('/api/v1/payroll/generations')
      .set(s.headers)
      .send({ periodId: next.id })
      .expect(400);
  });

  it('preserves corrections during refresh, freezes paid slips, reverses safely, and records a new payment', async () => {
    const s = await scenario();
    await s.generate().expect(201);
    const row = await db.manager.findOneByOrFail(PayrollEntity, {
      tenantId: s.tenant.id,
      tutorId: s.tutor.id,
    });
    let p = await detail(s.tenant.id, row.id);
    const input = {
      version: p.version,
      teaching: p.items.map((i) => ({
        id: i.id,
        quantity: i.sourceCount + (i.description === 'Alpha' ? 2 : 0),
        rate: i.description === 'Alpha' ? '60000.10' : i.rate,
        correctionReason: 'Koreksi sesi pengganti',
      })),
      adjustments: [
        { kind: 'addition', description: 'Bonus', amount: '100000' },
        { kind: 'deduction', description: 'Potongan', amount: '25000' },
      ],
    };
    p = (
      await api()
        .patch(`/api/v1/payroll/${p.id}/items`)
        .set(s.headers)
        .send(input)
        .expect(200)
    ).body;
    expect(p.total).toBe('365000.65');
    await db.manager.update(TutorEntity, s.tutor.id, {
      sessionRate: '99999.00',
    });
    await s.session(0);
    expect((await detail(s.tenant.id, p.id)).sourceChanged).toBe(true);
    const body = {
      version: p.version,
      requestId: randomUUID(),
      method: 'cash',
      paidAt: new Date().toISOString(),
    };
    await api()
      .post(`/api/v1/payroll/${p.id}/payments`)
      .set(s.headers)
      .send(body)
      .expect(409);
    p = (
      await api()
        .post(`/api/v1/payroll/${p.id}/recalculations`)
        .set(s.headers)
        .send({ version: p.version })
        .expect(201)
    ).body;
    expect(p.total).toBe('425000.75');
    expect(p.defaultRate).toBe('50000.25');
    expect(p.items.find((i) => i.description === 'Alpha')).toMatchObject({
      sourceCount: 3,
      sessionAdjustment: 2,
      quantity: 5,
      rate: '60000.10',
    });
    const paymentBody = {
      ...body,
      version: p.version,
      requestId: randomUUID(),
      paidAt: new Date().toISOString(),
      method: 'bank_transfer',
    };
    const pay = () => {
      const req = api().post(`/api/v1/payroll/${p.id}/payments`).set(s.headers);
      for (const [key, value] of Object.entries(paymentBody))
        req.field(key, String(value));
      return req.attach('file', png, 'bukti.png');
    };
    const paid = await Promise.all([pay().expect(201), pay().expect(201)]);
    p = paid[0].body;
    expect(p.status).toBe('paid');
    expect(p.payments).toHaveLength(1);
    const payment = p.payments[0];
    await api()
      .get(`/api/v1/payroll/${p.id}/payments/${payment.id}/proof`)
      .set(s.headers)
      .expect('Content-Type', /image\/png/)
      .expect(200);
    const snapshot = (
      await db.manager.findOneByOrFail(PayrollPaymentEntity, { id: payment.id })
    ).snapshot;
    expect(snapshot.sources).toHaveLength(4);
    await db.manager.update(TutorEntity, s.tutor.id, {
      name: 'New Name',
      bankName: 'Other Bank',
    });
    expect(
      (
        await db.manager.findOneByOrFail(PayrollPaymentEntity, {
          id: payment.id,
        })
      ).snapshot,
    ).toEqual(snapshot);
    await api()
      .get(`/api/v1/payroll/${p.id}/pdf`)
      .set(s.headers)
      .expect('Content-Type', /application\/pdf/)
      .expect(200);
    await api()
      .patch(`/api/v1/payroll/${p.id}/items`)
      .set(s.headers)
      .send({ ...input, version: p.version })
      .expect(409);
    const tutorToken = await login(s.tutorUser.email);
    const otherUser = await db.manager.save(UserEntity, {
      tenantId: s.tenant.id,
      email: `other-payroll-${randomUUID()}@example.com`,
      passwordHash,
      role: UserRole.Tutor,
      status: EntityStatus.Active,
    });
    await db.manager.save(TutorEntity, {
      tenantId: s.tenant.id,
      userId: otherUser.id,
      name: 'Other Tutor',
      phoneNumber: '081234567899',
      sessionRate: '10000',
      status: EntityStatus.Active,
    });
    const otherToken = await login(otherUser.email);
    await api()
      .get(`/api/v1/tutor/payroll/${p.id}`)
      .set(auth(otherToken, s.tenant.id))
      .expect(404);
    await api()
      .get(`/api/v1/tutor/payroll/${p.id}/pdf`)
      .set(auth(otherToken, s.tenant.id))
      .expect(404);
    await api()
      .get(`/api/v1/tutor/payroll/${p.id}`)
      .set(auth(tutorToken, s.tenant.id))
      .expect(200);
    const locked = await db.manager.findOneByOrFail(ClassSessionEntity, {
      id: s.sessions[0].id,
    });
    expect(locked.lockReason).toBe(`payroll:${p.id}`);
    const record = {
      version: locked.version,
      topic: 'Perbaikan materi',
      attendance: [{ studentId: s.student.id, status: 'present' }],
    };
    await api()
      .put(`/api/v1/class-sessions/${locked.id}/record`)
      .set(s.headers)
      .send(record)
      .expect(409);
    await api()
      .post(`/api/v1/payroll/${p.id}/payments/${payment.id}/reversals`)
      .set(s.headers)
      .send({ version: p.version, reason: 'x' })
      .expect(400);
    p = (
      await api()
        .post(`/api/v1/payroll/${p.id}/payments/${payment.id}/reversals`)
        .set(s.headers)
        .send({ version: p.version, reason: 'Koreksi pembayaran' })
        .expect(201)
    ).body;
    expect(p.status).not.toBe('paid');
    expect(p.payments[0].reversalReason).toBe('Koreksi pembayaran');
    await api()
      .get(`/api/v1/tutor/payroll/${p.id}/pdf`)
      .set(auth(tutorToken, s.tenant.id))
      .expect(404);
    await api()
      .get(`/api/v1/payroll/${p.id}/payments/${payment.id}/pdf`)
      .set(s.headers)
      .expect(200);
    const unlocked = await db.manager.findOneByOrFail(ClassSessionEntity, {
      id: locked.id,
    });
    expect(unlocked.lockedAt).toBeNull();
    await api()
      .put(`/api/v1/class-sessions/${locked.id}/record`)
      .set(s.headers)
      .send({ ...record, version: unlocked.version })
      .expect(200);
    await api()
      .post(`/api/v1/payroll/${p.id}/payments`)
      .set(s.headers)
      .send({ ...paymentBody, requestId: randomUUID(), version: p.version })
      .expect(409);
    p = (
      await api()
        .post(`/api/v1/payroll/${p.id}/recalculations`)
        .set(s.headers)
        .send({ version: p.version })
        .expect(201)
    ).body;
    p = (
      await api()
        .post(`/api/v1/payroll/${p.id}/payments`)
        .set(s.headers)
        .send({ ...paymentBody, requestId: randomUUID(), version: p.version })
        .expect(201)
    ).body;
    expect(p.payments).toHaveLength(2);
    expect(p.payments.filter((i) => !i.reversedAt)).toHaveLength(1);
    expect(p.events.some((e) => e.type === 'payment_reversed')).toBe(true);
    const summary = await api()
      .get('/api/v1/payroll/summary')
      .set(s.headers)
      .expect(200);
    expect(summary.body.paidAmount).toBe('425000.75');
    const runner = db.createQueryRunner();
    try {
      await expect(
        new CreatePayroll20261116000000().down(runner),
      ).rejects.toThrow('payroll history exists');
    } finally {
      await runner.release();
    }
  });

  it('enforces tenant, menu, self-service, upload and optimistic-version boundaries', async () => {
    const s = await scenario();
    await s.generate().expect(201);
    const p = await db.manager.findOneByOrFail(PayrollEntity, {
      tenantId: s.tenant.id,
      tutorId: s.tutor.id,
    });
    const foreign = await db.manager.save(TenantEntity, {
      ownerId,
      name: 'Foreign Payroll',
      status: EntityStatus.Active,
    });
    await api()
      .get(`/api/v1/payroll/${p.id}`)
      .set(auth(ownerToken, foreign.id))
      .expect(404);
    await api()
      .post('/api/v1/payroll/generations')
      .set(auth(ownerToken, foreign.id))
      .send({ periodId: s.period.id })
      .expect(404);
    await api().get('/api/v1/payroll').expect(401);
    const deniedUser = await db.manager.save(UserEntity, {
      tenantId: s.tenant.id,
      email: `payroll-denied-${randomUUID()}@example.com`,
      passwordHash,
      role: UserRole.Operator,
      status: EntityStatus.Active,
    });
    await db.manager.save(OperatorEntity, {
      tenantId: s.tenant.id,
      userId: deniedUser.id,
      name: 'Denied Operator',
      phoneNumber: '081234567894',
      menuPermissions: [],
      status: EntityStatus.Active,
    });
    const denied = auth(await login(deniedUser.email), s.tenant.id);
    for (const path of [
      '/payroll',
      '/payroll/settings',
      '/payroll/export',
      `/payroll/${p.id}`,
      `/payroll/${p.id}/pdf`,
    ])
      await api().get(`/api/v1${path}`).set(denied).expect(403);
    await api()
      .patch('/api/v1/payroll/settings')
      .set(s.headers)
      .send({ payday: 32, enabled: true })
      .expect(400);
    await api()
      .patch('/api/v1/payroll/settings')
      .set(s.headers)
      .send({ payday: 5, enabled: true, tenantId: foreign.id })
      .expect(400);
    const tutorToken = await login(s.tutorUser.email);
    await api()
      .get('/api/v1/payroll')
      .set(auth(tutorToken, s.tenant.id))
      .expect(403);
    await api()
      .get(`/api/v1/tutor/payroll/${p.id}`)
      .set(auth(tutorToken, s.tenant.id))
      .expect(404);
    await api()
      .post(`/api/v1/payroll/${p.id}/recalculations`)
      .set(s.headers)
      .send({ version: 999 })
      .expect(409);
    const invalid = api()
      .post(`/api/v1/payroll/${p.id}/payments`)
      .set(s.headers)
      .field('version', p.version)
      .field('requestId', randomUUID())
      .field('paidAt', new Date().toISOString())
      .field('method', 'cash');
    await invalid
      .attach('file', Buffer.from('not an image'), 'fake.png')
      .expect(400);
    expect(
      (await db.manager.findOneByOrFail(PayrollEntity, { id: p.id })).paidAt,
    ).toBeNull();
    expect(
      (
        await db.manager.findOneByOrFail(ClassSessionEntity, {
          id: s.sessions[0].id,
        })
      ).lockedAt,
    ).toBeNull();
    await db.manager.update(
      OperatorEntity,
      { userId: deniedUser.id },
      { menuPermissions: [OperatorMenu.Payroll] },
    );
    await api().get('/api/v1/payroll/tutor-options').set(denied).expect(200);
  });

  it('backfills a missing session month atomically without duplicating payrolls or changing the automatic schedule', async () => {
    const s = await scenario();
    const foreign = await scenario();
    const month = monthOffset(s.period.startDate, -1);
    const before = await app.get(PayrollPeriodsService).list(s.tenant.id);
    await s.session(0, `${month}-01`);
    const requestMonth = (body: object) =>
      api()
        .post('/api/v1/payroll/generations/by-month')
        .set(s.headers)
        .send(body);
    for (const sessionMonth of [
      jakartaDate().slice(0, 7),
      monthOffset(jakartaDate(), 1),
      '2026-13',
      '2026-1',
      '0000-01',
    ]) {
      await requestMonth({ sessionMonth }).expect(400);
    }
    await requestMonth({
      sessionMonth: month,
      tutorId: foreign.tutor.id,
    }).expect(404);
    expect(await app.get(PayrollPeriodsService).list(s.tenant.id)).toEqual(
      before,
    );
    await requestMonth({
      sessionMonth: month,
      tenantId: foreign.tenant.id,
    }).expect(400);
    const results = await Promise.all([
      requestMonth({ sessionMonth: month, tutorId: s.tutor.id }).expect(201),
      requestMonth({ sessionMonth: month, tutorId: s.tutor.id }).expect(201),
    ]);
    expect(results.reduce((count, r) => count + r.body.created, 0)).toBe(1);
    expect(results[0].body.periodId).toBe(results[1].body.periodId);
    const periods = await app.get(PayrollPeriodsService).list(s.tenant.id);
    expect(periods).toHaveLength(before.length + 1);
    expect(periods.find((p) => p.id === s.period.id)).toEqual(before[0]);
    const added = periods.find((p) => p.id === results[0].body.periodId);
    if (!added) throw new Error('Missing manually generated period');
    expect(added.startDate).toBe(`${month}-01`);
    expect(added.payDate.slice(0, 7)).toBe(s.period.startDate.slice(0, 7));
    const row = await db.manager.findOneByOrFail(PayrollEntity, {
      periodId: added.id,
      tenantId: s.tenant.id,
    });
    expect(row.total).toBe('50000.25');
    expect(row.paidAt).toBeNull();
    // Reusing a month after changing the payday preserves its issued dates.
    const payday = Number(jakartaDate().slice(8)) === 1 ? 2 : 1;
    await app
      .get(PayrollPeriodsService)
      .update(s.tenant.id, { payday, enabled: false });
    const repeated = await requestMonth({ sessionMonth: month }).expect(201);
    expect(repeated.body.created).toBe(0);
    expect(repeated.body.skippedExisting).toBe(1);
    expect(
      await db.manager.findOneByOrFail(PayrollEntity, { id: row.id }),
    ).toEqual(row);
    expect(
      await db.manager.countBy(PayrollPeriodEntity, { tenantId: s.tenant.id }),
    ).toBe(before.length + 1);
  });

  it('allows manual payroll at the WIB month boundary while automation waits for payday and preserves it', async () => {
    const s = await scenario(new Date('2026-11-23T00:00:00Z'), 23);
    const periods = app.get(PayrollPeriodsService);
    const generation = app.get(PayrollGenerationService);
    const automation = app.get(PayrollAutomationService);
    expect(s.period).toMatchObject({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      payDate: '2026-11-23',
    });
    await periods.update(
      s.tenant.id,
      { payday: 23, enabled: true },
      new Date('2026-11-01T00:00:00Z'),
    );
    const spy = vi.spyOn(generation, 'generate');
    try {
      const beforeEnd = new Date('2026-10-31T16:59:59Z');
      await expect(
        generation.generate(
          s.tenant.id,
          s.period.id,
          null,
          s.tutor.id,
          beforeEnd,
        ),
      ).rejects.toThrow('setelah periode sesi berakhir');
      const early = new Date('2026-10-31T17:00:00Z');
      spy.mockClear();
      await automation.run(early);
      expect(
        spy.mock.calls.filter(([tenantId]) => tenantId === s.tenant.id),
      ).toHaveLength(0);
      expect(
        (
          await generation.generate(
            s.tenant.id,
            s.period.id,
            null,
            s.tutor.id,
            early,
          )
        ).created,
      ).toBe(1);
      const original = await db.manager.findOneByOrFail(PayrollEntity, {
        tenantId: s.tenant.id,
        periodId: s.period.id,
        tutorId: s.tutor.id,
      });
      expect(original.paidAt).toBeNull();
      expect(original.payDate).toBe('2026-11-23');
      expect(original.issuedDate).toBe('2026-11-01');
      await db.manager.update(TutorEntity, s.tutor.id, {
        sessionRate: '99999.00',
      });
      spy.mockClear();
      await automation.run(new Date('2026-11-22T17:00:00Z'));
      expect(
        spy.mock.calls.filter(([tenantId]) => tenantId === s.tenant.id),
      ).toHaveLength(1);
      expect(
        await db.manager.findOneByOrFail(PayrollEntity, { id: original.id }),
      ).toEqual(original);
      expect(
        await db.manager.countBy(PayrollEntity, {
          tenantId: s.tenant.id,
          periodId: s.period.id,
        }),
      ).toBe(1);
      expect(await periods.list(s.tenant.id)).toHaveLength(2);
    } finally {
      spy.mockRestore();
      await periods.update(
        s.tenant.id,
        { payday: 23, enabled: false },
        new Date('2026-11-23T00:00:00Z'),
      );
    }
  });

  it('changes only the unissued cycle and recovers missed automatic cycles once', async () => {
    const tenant = await db.manager.save(TenantEntity, {
      ownerId,
      name: 'Cycle Bimbel',
      status: EntityStatus.Active,
    });
    const periods = app.get(PayrollPeriodsService);
    await periods.update(
      tenant.id,
      { payday: 5, enabled: false },
      new Date('2026-11-06T00:00:00Z'),
    );
    let settings = await periods.update(
      tenant.id,
      { payday: 10, enabled: true },
      new Date('2026-11-15T00:00:00Z'),
    );
    expect(settings.nextPeriod).toMatchObject({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      payDate: '2026-12-10',
    });
    settings = await periods.update(
      tenant.id,
      { payday: 5, enabled: true },
      new Date('2026-12-07T00:00:00Z'),
    );
    expect(settings.nextPeriod).toMatchObject({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      payDate: '2026-12-05',
    });
    const firstId = settings.nextPeriod!.id;
    await app
      .get(PayrollGenerationService)
      .generate(
        tenant.id,
        firstId,
        null,
        undefined,
        new Date('2026-12-10T00:00:00Z'),
      );
    settings = await periods.update(
      tenant.id,
      { payday: 20, enabled: true },
      new Date('2026-12-11T00:00:00Z'),
    );
    expect(settings.nextPeriod).toMatchObject({
      startDate: '2026-12-01',
      endDate: '2026-12-31',
      payDate: '2027-01-20',
    });
    expect(
      (await db.manager.findOneByOrFail(PayrollPeriodEntity, { id: firstId }))
        .payDate,
    ).toBe('2026-12-05');
    const automation = app.get(PayrollAutomationService);
    const generationService = app.get(PayrollGenerationService);
    const generate = generationService.generate.bind(generationService);
    let failed = false;
    const generation = vi
      .spyOn(generationService, 'generate')
      .mockImplementation(async (...args) => {
        if (args[0] === tenant.id && !failed) {
          failed = true;
          throw new Error('Temporary failure');
        }
        return generate(...args);
      });
    await automation.run(new Date('2027-02-21T00:00:00Z'));
    expect(
      (await periods.list(tenant.id)).filter((p) => p.processedAt),
    ).toHaveLength(1);
    await automation.run(new Date('2027-02-21T00:00:00Z'));
    generation.mockRestore();
    const list = await periods.list(tenant.id);
    expect(list.filter((p) => p.processedAt)).toHaveLength(3);
    expect(list[0].payDate).toBe('2027-03-20');
    await automation.run(new Date('2027-02-21T00:00:00Z'));
    expect(await periods.list(tenant.id)).toHaveLength(list.length);
  });
});
