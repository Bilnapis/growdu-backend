import { randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/app.setup.js';
import { PasswordHashService } from '../src/common/security/password-hash.service.js';
import { EntityStatus } from '../src/common/enums/entity-status.enum.js';
import { UserEntity, UserRole } from '../src/users/entities/user.entity.js';
import { OwnerEntity } from '../src/owners/entities/owner.entity.js';
import { OperatorEntity } from '../src/operators/entities/operator.entity.js';
import { OperatorMenu } from '../src/operators/menu-permissions.js';
import { TenantEntity } from '../src/tenants/entities/tenant.entity.js';
import { TutorEntity } from '../src/tutors/entities/tutor.entity.js';
import { StudentEntity } from '../src/students/entities/student.entity.js';
import { ClassSessionEntity } from '../src/class-sessions/entities/class-session.entity.js';
import { ClassSessionStudentEntity } from '../src/class-sessions/entities/class-session-student.entity.js';
import { ReportGenerationService } from '../src/learning-reports/report-generation.service.js';
import {
  LearningReportEntity,
  LearningReportEventEntity,
  LearningReportRevisionEntity,
} from '../src/learning-reports/entities/learning-report.entity.js';
import type { ReportGroupDetailDto } from '../src/learning-reports/dto/report-response.dto.js';

function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  return [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      const header = raw.slice(
        Math.max(0, (match.index ?? 0) - 180),
        match.index,
      );
      const stream = Buffer.from(match[1], 'latin1');
      const text = (
        header.includes('FlateDecode') ? inflateSync(stream) : stream
      ).toString('latin1');
      return [...text.matchAll(/<([\da-f]+)>/gi)]
        .map((hex) => Buffer.from(hex[1], 'hex').toString('latin1'))
        .join('');
    })
    .join('');
}

describe('Learning reports API (MySQL)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let ownerId: string;
  let token: string;
  let passwordHash: string;
  const password = 'report-e2e-password';
  const api = () => request(app.getHttpServer());
  const auth = (accessToken: string, tenantId: string) => ({
    Authorization: 'Bearer ' + accessToken,
    'X-Tenant-Id': tenantId,
  });
  async function login(email: string): Promise<string> {
    const result = await api()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const body: unknown = result.body;
    if (
      !body ||
      typeof body !== 'object' ||
      !('accessToken' in body) ||
      typeof body.accessToken !== 'string'
    )
      throw new Error('Missing token');
    return body.accessToken;
  }
  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
      abortOnError: false,
    });
    configureApplication(app);
    await app.init();
    db = app.get(DataSource);
    passwordHash = await app.get(PasswordHashService).hash(password);
    const user = await db.manager.save(UserEntity, {
      email: 'reports-owner-' + randomUUID() + '@example.com',
      passwordHash,
      role: UserRole.Owner,
      tenantId: null,
      status: EntityStatus.Active,
    });
    const owner = await db.manager.save(OwnerEntity, {
      userId: user.id,
      name: 'Report Owner',
      phoneNumber: '081234567890',
      status: EntityStatus.Active,
    });
    ownerId = owner.id;
    token = await login(user.email);
  });
  afterAll(async () => {
    await app?.close();
  });
  async function fixture() {
    const tenant = await db.manager.save(TenantEntity, {
      ownerId,
      name: 'Report Bimbel',
      address: 'Bandung',
      status: EntityStatus.Active,
    });
    const tutors: TutorEntity[] = [];
    for (const name of ['Budi', 'Rina']) {
      const user = await db.manager.save(UserEntity, {
        tenantId: tenant.id,
        email: 'reports-tutor-' + randomUUID() + '@example.com',
        passwordHash,
        role: UserRole.Tutor,
        status: EntityStatus.Active,
      });
      tutors.push(
        await db.manager.save(TutorEntity, {
          tenantId: tenant.id,
          userId: user.id,
          name,
          phoneNumber: '081234567891',
          email: user.email,
          sessionRate: '50000',
          status: EntityStatus.Active,
        }),
      );
    }
    const students: StudentEntity[] = [];
    for (const name of ['Alice', 'Bob'])
      students.push(
        await db.manager.save(StudentEntity, {
          tenantId: tenant.id,
          studentCode: randomUUID().slice(0, 8),
          name,
          gender: 'male',
          educationLevel: 'SMA 10',
          school: 'SMA',
          address: 'Bandung',
          administrativeStatus: EntityStatus.Active,
          status: EntityStatus.Active,
        }),
      );
    const groupId = randomUUID(),
      config = randomUUID(),
      rule = randomUUID();
    await db.query(
      'INSERT INTO study_groups(id,tenant_id,name) VALUES (?,?,?)',
      [groupId, tenant.id, 'Matematika Intensif'],
    );
    await db.query(
      "INSERT INTO study_group_configurations(id,tenant_id,study_group_id,effective_from,effective_until) VALUES (?,?,?,'2026-09-01','2026-09-30')",
      [config, tenant.id, groupId],
    );
    await db.query(
      "INSERT INTO study_group_schedules(id,tenant_id,study_group_id,tutor_id,day_of_week,start_time,end_time,sort_order,configuration_id,series_id) VALUES (?,?,?,?,1,'08:00','09:00',0,?,?)",
      [rule, tenant.id, groupId, tutors[0].id, config, rule],
    );
    const sessions: ClassSessionEntity[] = [];
    for (const tutor of tutors) {
      const session = await db.manager.save(ClassSessionEntity, {
        tenantId: tenant.id,
        studyGroupId: groupId,
        configurationId: config,
        scheduleRuleId: rule,
        seriesId: randomUUID(),
        sessionDate: '2026-09-07',
        occurrenceDate: '2026-09-07',
        startTime: '08:00',
        endTime: '09:00',
        tutorId: tutor.id,
        roomId: null,
        studyGroupName: 'Matematika Intensif',
        subject: 'Matematika',
        status: 'completed',
        topic: 'Aljabar',
        version: 1,
      });
      sessions.push(session);
      for (const student of students)
        await db.manager.save(ClassSessionStudentEntity, {
          sessionId: session.id,
          studentId: student.id,
          name: student.name,
          school: student.school,
          educationLevel: student.educationLevel,
          status: 'present',
        });
    }
    const headers = auth(token, tenant.id);
    const detail = async (
      customHeaders = headers,
    ): Promise<ReportGroupDetailDto> =>
      (
        await api()
          .get('/api/v1/learning-reports/groups/' + groupId)
          .query({ period: '2026-09' })
          .set(customHeaders)
          .expect(200)
      ).body;
    const generate = () =>
      api()
        .post('/api/v1/learning-reports/generations')
        .set(headers)
        .send({ period: '2026-09' });
    return {
      tenant,
      tutors,
      students,
      sessions,
      groupId,
      headers,
      detail,
      generate,
    };
  }
  const content = {
    material: 'Aljabar',
    progress: 'Semakin baik',
    followUp: 'Latihan rutin',
    parentNote: '',
  };
  it('creates drafts once under concurrent generation and lists a paginated group with two tutors', async () => {
    const f = await fixture();
    const result = await Promise.all([
      f.generate().expect(201),
      f.generate().expect(201),
    ]);
    expect(result.map((r) => r.body.created).sort()).toEqual([0, 2]);
    const list = await api()
      .get('/api/v1/learning-reports/groups')
      .query({ period: '2026-09', limit: 1 })
      .set(f.headers)
      .expect(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        id: f.groupId,
        required: 2,
        published: 0,
        status: 'draft',
        studentCount: 2,
        sessionCount: 2,
      }),
    ]);
    const summary = await api()
      .get('/api/v1/learning-reports/summary')
      .query({ period: '2026-09' })
      .set(f.headers)
      .expect(200);
    expect(summary.body).toEqual({ total: 1, published: 0, pending: 1 });
    await api()
      .get('/api/v1/learning-reports/groups')
      .query({ period: '2026-13' })
      .set(f.headers)
      .expect(400);
    await api()
      .get('/api/v1/learning-reports/groups')
      .query({ period: '2026-09', search: 'Budi', status: 'unfilled' })
      .set(f.headers)
      .expect(200)
      .expect((r) => expect(r.body.meta.total).toBe(0));
  });
  it('protects own drafts, requires attendance, publishes partially, and retains the old version during revision', async () => {
    const f = await fixture();
    await f.generate().expect(201);
    const tutorHeaders = auth(
      await login(f.tutors[0].email ?? ''),
      f.tenant.id,
    );
    let detail = await f.detail();
    const first = detail.contributions.find(
      (c) => c.tutorId === f.tutors[0].id,
    );
    const second = detail.contributions.find(
      (c) => c.tutorId === f.tutors[1].id,
    );
    if (!first?.id || !second?.id) throw new Error('Missing drafts');
    const own = await f.detail(tutorHeaders);
    expect(own.contributions.find((c) => c.id === second.id)?.draft).toBeNull();
    await api()
      .patch('/api/v1/learning-reports/' + second.id)
      .set(tutorHeaders)
      .send({ version: 1, ...content, notes: [] })
      .expect(403);
    await db.manager.update(
      ClassSessionEntity,
      { id: f.sessions[0].id },
      { status: 'scheduled' },
    );
    await api()
      .patch('/api/v1/learning-reports/' + first.id)
      .set(tutorHeaders)
      .send({
        version: 1,
        ...content,
        notes: [
          { studentId: f.students[0].id, note: 'Alice private' },
          { studentId: f.students[1].id, note: 'Bob private' },
        ],
      })
      .expect(200);
    await api()
      .post('/api/v1/learning-reports/' + first.id + '/publications')
      .set(tutorHeaders)
      .send({ version: 2 })
      .expect(400);
    await db.manager.update(
      ClassSessionEntity,
      { id: f.sessions[0].id },
      { status: 'completed' },
    );
    await api()
      .post('/api/v1/learning-reports/' + first.id + '/publications')
      .set(tutorHeaders)
      .send({ version: 2 })
      .expect(201);
    expect((await f.detail()).status).toBe('partially_published');
    expect(
      (await f.detail()).contributions.find((c) => c.id === first.id)
        ?.sourceChanged,
    ).toBe(false);
    const privatePdf = await api()
      .get('/api/v1/learning-reports/groups/' + f.groupId + '/pdf')
      .query({ period: '2026-09', studentId: f.students[0].id })
      .set(f.headers)
      .expect(200);
    const text = pdfText(privatePdf.body);
    expect(text).toContain('Alice');
    expect(text).toContain('Alice private');
    expect(text).not.toContain('Bob');
    await db.manager.update(
      ClassSessionEntity,
      { id: f.sessions[0].id },
      { version: 2 },
    );
    expect(
      (await f.detail()).contributions.find((c) => c.id === first.id)
        ?.sourceChanged,
    ).toBe(true);
    await api()
      .post('/api/v1/learning-reports/' + first.id + '/revisions')
      .set(tutorHeaders)
      .send({ version: 3, reason: 'Koreksi' })
      .expect(403);
    await api()
      .post('/api/v1/learning-reports/' + first.id + '/revisions')
      .set(f.headers)
      .send({ version: 3, reason: 'Perbaiki tindak lanjut' })
      .expect(201);
    await api()
      .patch('/api/v1/learning-reports/' + first.id)
      .set(tutorHeaders)
      .send({ version: 3, ...content, notes: [] })
      .expect(409);
    await api()
      .patch('/api/v1/learning-reports/' + first.id)
      .set(tutorHeaders)
      .send({
        version: 4,
        ...content,
        material: 'Revisi draft rahasia',
        notes: [],
      })
      .expect(200);
    detail = await f.detail();
    expect(
      detail.contributions.find((c) => c.id === first.id)?.published?.content
        .material,
    ).toBe('Aljabar');
    expect(detail.contributions.find((c) => c.id === first.id)?.revising).toBe(
      true,
    );
    const duringRevision = await api()
      .get('/api/v1/learning-reports/groups/' + f.groupId + '/pdf')
      .query({ period: '2026-09', studentId: f.students[0].id })
      .set(f.headers)
      .expect(200);
    expect(pdfText(duringRevision.body)).not.toContain('Revisi draft rahasia');
    await f
      .generate()
      .expect(201)
      .expect((r) => expect(r.body.created).toBe(0));
    expect(
      (await f.detail()).contributions.find((c) => c.id === first.id)?.draft
        ?.content.material,
    ).toBe('Revisi draft rahasia');
    await api()
      .post('/api/v1/learning-reports/' + first.id + '/publications')
      .set(tutorHeaders)
      .send({ version: 5 })
      .expect(201);
    await api()
      .patch('/api/v1/learning-reports/' + second.id)
      .set(f.headers)
      .send({ version: 1, ...content, notes: [] })
      .expect(200);
    await api()
      .post('/api/v1/learning-reports/' + second.id + '/publications')
      .set(f.headers)
      .send({ version: 2 })
      .expect(201);
    expect((await f.detail()).status).toBe('published');
    const pdf = await api()
      .get('/api/v1/learning-reports/groups/' + f.groupId + '/pdf')
      .query({ period: '2026-09', studentId: f.students[0].id })
      .set(f.headers)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    await api()
      .get('/api/v1/learning-reports/groups/' + f.groupId + '/pdf')
      .query({ period: '2026-09', studentId: randomUUID() })
      .set(f.headers)
      .expect(404);
    const records = await db.manager.findBy(LearningReportRevisionEntity, {
      reportId: first.id,
    });
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.number === 1)?.content.material).toBe(
      'Aljabar',
    );
    await api()
      .get('/api/v1/learning-reports/settings')
      .set(tutorHeaders)
      .expect(403);
    await api()
      .post('/api/v1/learning-reports/generations')
      .set(tutorHeaders)
      .send({ period: '2026-09' })
      .expect(403);
    await api()
      .get('/api/v1/learning-reports/groups/' + f.groupId)
      .query({ period: '2026-09' })
      .set(auth(token, randomUUID()))
      .expect(403);
  });
  it('generates the previous month at WIB midnight, catches up downtime, and skips disabled months on reactivation', async () => {
    const f = await fixture();
    const generation = app.get(ReportGenerationService);
    await generation.settings(f.tenant.id, new Date('2026-09-30T16:59:59Z'));
    const september = await generation.processDue(
      f.tenant.id,
      new Date('2026-09-30T16:59:59Z'),
    );
    expect(september.map((r) => r.period)).toEqual(['2026-08']);
    const october = await generation.processDue(
      f.tenant.id,
      new Date('2026-09-30T17:00:00Z'),
    );
    expect(october).toEqual([{ period: '2026-09', created: 2, skipped: 0 }]);
    expect(
      await generation.processDue(
        f.tenant.id,
        new Date('2026-09-30T17:00:01Z'),
      ),
    ).toEqual([]);
    const december = await generation.processDue(
      f.tenant.id,
      new Date('2026-12-03T00:00:00Z'),
    );
    expect(december.map((r) => r.period)).toEqual(['2026-10', '2026-11']);
    expect((await generation.settings(f.tenant.id)).lastResult?.period).toBe(
      '2026-11',
    );
    const setting = await generation.settings(f.tenant.id);
    await generation.update(
      f.tenant.id,
      { version: setting.version, enabled: false, generationDay: 31 },
      new Date('2026-12-03T00:00:00Z'),
    );
    expect(
      await generation.processDue(
        f.tenant.id,
        new Date('2027-03-02T00:00:00Z'),
      ),
    ).toEqual([]);
    const disabled = await generation.settings(f.tenant.id);
    const enabled = await generation.update(
      f.tenant.id,
      { version: disabled.version, enabled: true, generationDay: 31 },
      new Date('2027-03-02T00:00:00Z'),
    );
    expect(enabled.nextRunDate).toBe('2027-03-31');
    expect(
      await db.manager.countBy(LearningReportEntity, { tenantId: f.tenant.id }),
    ).toBe(2);
  });
  it('preserves enabled overdue months on date changes and rejects non-boolean settings', async () => {
    const f = await fixture();
    const generation = app.get(ReportGenerationService);
    const september = await generation.settings(
      f.tenant.id,
      new Date('2026-09-01T00:00:00Z'),
    );
    await generation.update(
      f.tenant.id,
      { version: september.version, enabled: true, generationDay: 15 },
      new Date('2026-12-01T00:00:00Z'),
    );
    const result = await generation.processDue(
      f.tenant.id,
      new Date('2026-12-01T00:00:00Z'),
    );
    expect(result.map((r) => r.period)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    const settings = await generation.settings(f.tenant.id);
    await api()
      .patch('/api/v1/learning-reports/settings')
      .set(f.headers)
      .send({ version: settings.version, enabled: 'false', generationDay: 1 })
      .expect(400);
    await api()
      .patch('/api/v1/learning-reports/settings')
      .set(f.headers)
      .send({ version: settings.version, enabled: 'invalid', generationDay: 1 })
      .expect(400);
    await api()
      .patch('/api/v1/learning-reports/settings')
      .set(f.headers)
      .send({ version: settings.version, enabled: false, generationDay: 32 })
      .expect(400);
  });
  it('keeps cancelled-assignment drafts out of required counts and removes former tutor group access', async () => {
    const f = await fixture();
    await f.generate().expect(201);
    const former = auth(await login(f.tutors[0].email ?? ''), f.tenant.id);
    await db.manager.update(
      ClassSessionEntity,
      { id: f.sessions[0].id },
      { status: 'cancelled' },
    );
    await api()
      .get('/api/v1/learning-reports/groups/' + f.groupId)
      .set(former)
      .query({ period: '2026-09' })
      .expect(403);
    const before = await f.detail();
    expect(before.required).toBe(1);
    const remaining = before.contributions.find(
      (c) => c.tutorId === f.tutors[1].id,
    );
    if (!remaining?.id) throw new Error('Missing remaining draft');
    await api()
      .patch('/api/v1/learning-reports/' + remaining.id)
      .set(f.headers)
      .send({ version: 1, ...content, notes: [] })
      .expect(200);
    await api()
      .post('/api/v1/learning-reports/' + remaining.id + '/publications')
      .set(f.headers)
      .send({ version: 2 })
      .expect(201);
    expect((await f.detail()).status).toBe('published');
    const list = await api()
      .get('/api/v1/learning-reports/groups')
      .query({ period: '2026-09' })
      .set(f.headers)
      .expect(200);
    expect(list.body.data[0]).toMatchObject({
      required: 1,
      published: 1,
      status: 'published',
    });
  });
  it('enforces operator menu permissions and preserves audit events when an operator is removed', async () => {
    const f = await fixture();
    const user = await db.manager.save(UserEntity, {
      tenantId: f.tenant.id,
      email: 'reports-operator-' + randomUUID() + '@example.com',
      passwordHash,
      role: UserRole.Operator,
      status: EntityStatus.Active,
    });
    const operator = await db.manager.save(OperatorEntity, {
      tenantId: f.tenant.id,
      userId: user.id,
      name: 'Report operator',
      phoneNumber: '081234567890',
      menuPermissions: [],
      status: EntityStatus.Active,
    });
    const headers = auth(await login(user.email), f.tenant.id);
    await api()
      .get('/api/v1/learning-reports/groups')
      .query({ period: '2026-09' })
      .set(headers)
      .expect(403);
    await db.manager.update(
      OperatorEntity,
      { id: operator.id },
      { menuPermissions: [OperatorMenu.Reports] },
    );
    await api()
      .post('/api/v1/learning-reports/generations')
      .set(headers)
      .send({ period: '2026-09' })
      .expect(201);
    const report = await db.manager.findOneByOrFail(LearningReportEntity, {
      tenantId: f.tenant.id,
    });
    const event = await db.manager.findOneByOrFail(LearningReportEventEntity, {
      reportId: report.id,
    });
    expect(event.actorId).toBe(user.id);
    await db.manager.delete(OperatorEntity, { id: operator.id });
    await db.manager.delete(UserEntity, { id: user.id });
    expect(
      (
        await db.manager.findOneByOrFail(LearningReportEventEntity, {
          id: event.id,
        })
      ).actorId,
    ).toBeNull();
  });
});
