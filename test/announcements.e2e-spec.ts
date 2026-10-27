import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/app.setup.js';
import { AnnouncementTargetRole } from '../src/announcements/announcement.types.js';
import { AnnouncementEntity } from '../src/announcements/entities/announcement.entity.js';
import { EntityStatus } from '../src/common/enums/entity-status.enum.js';
import { PasswordHashService } from '../src/common/security/password-hash.service.js';
import { OperatorEntity } from '../src/operators/entities/operator.entity.js';
import { OperatorMenu } from '../src/operators/menu-permissions.js';
import { OwnerEntity } from '../src/owners/entities/owner.entity.js';
import { ParentEntity } from '../src/parents/entities/parent.entity.js';
import { TenantEntity } from '../src/tenants/entities/tenant.entity.js';
import { TutorEntity } from '../src/tutors/entities/tutor.entity.js';
import { UserEntity, UserRole } from '../src/users/entities/user.entity.js';

describe('Announcements API (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let otherTenantId: string;
  let ownerToken: string;
  let operatorToken: string;
  let deniedToken: string;
  let tutorToken: string;
  let parentToken: string;
  const password = 'abc12';
  const input = {
    title: 'Libur Maulid Nabi',
    content: 'Kegiatan belajar diliburkan.',
    targetRole: AnnouncementTargetRole.All,
  };
  const path = '/api/v1/announcements';

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const token: unknown = response.body.accessToken;
    if (typeof token !== 'string') throw new Error('Expected access token');
    return token;
  }

  async function seed(overrides: Partial<AnnouncementEntity> = {}) {
    return dataSource.getRepository(AnnouncementEntity).save({
      tenantId,
      ...input,
      startsAt: null,
      endsAt: null,
      ...overrides,
    });
  }

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
    });
    configureApplication(app);
    await app.init();
    dataSource = app.get(DataSource);
    const manager = dataSource.manager;
    const passwordHash = await app.get(PasswordHashService).hash(password);
    const ownerUser = await manager.save(UserEntity, {
      email: 'announcements-owner@example.com',
      passwordHash,
      tenantId: null,
      role: UserRole.Owner,
      status: EntityStatus.Active,
    });
    const owner = await manager.save(OwnerEntity, {
      userId: ownerUser.id,
      name: 'Announcements Owner',
      phoneNumber: '0800000001',
      status: EntityStatus.Active,
    });
    tenantId = (
      await manager.save(TenantEntity, {
        ownerId: owner.id,
        name: 'Announcements Tenant A',
        status: EntityStatus.Active,
      })
    ).id;
    otherTenantId = (
      await manager.save(TenantEntity, {
        ownerId: owner.id,
        name: 'Announcements Tenant B',
        status: EntityStatus.Active,
      })
    ).id;

    async function account(
      role: UserRole,
      label: string,
      permissions: OperatorMenu[] = [],
    ) {
      const user = await manager.save(UserEntity, {
        tenantId,
        email: `announcements-${label}@example.com`,
        passwordHash,
        role,
        status: EntityStatus.Active,
      });
      const profile = {
        tenantId,
        userId: user.id,
        name: label,
        phoneNumber: '0800000002',
        status: EntityStatus.Active,
      };
      if (role === UserRole.Operator)
        await manager.save(OperatorEntity, {
          ...profile,
          menuPermissions: permissions,
        });
      if (role === UserRole.Tutor)
        await manager.save(TutorEntity, { ...profile, sessionRate: '0' });
      if (role === UserRole.Parent)
        await manager.save(ParentEntity, {
          ...profile,
          contactEmail: user.email,
        });
      return login(user.email);
    }
    ownerToken = await login(ownerUser.email);
    operatorToken = await account(UserRole.Operator, 'operator', [
      OperatorMenu.Announcements,
    ]);
    deniedToken = await account(UserRole.Operator, 'denied');
    tutorToken = await account(UserRole.Tutor, 'tutor');
    parentToken = await account(UserRole.Parent, 'parent');
  });

  beforeEach(async () => {
    await dataSource.getRepository(AnnouncementEntity).delete({ tenantId });
    await dataSource
      .getRepository(AnnouncementEntity)
      .delete({ tenantId: otherTenantId });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication and owner tenant selection', async () => {
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer()).get(`${path}/active`).expect(401);
    await request(app.getHttpServer())
      .get(path)
      .auth(ownerToken, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`${path}/active`)
      .auth(ownerToken, { type: 'bearer' })
      .expect(403);
  });

  it('creates, reads, patches and deletes with tenant-scoped CRUD', async () => {
    const created = await request(app.getHttpServer())
      .post(path)
      .auth(ownerToken, { type: 'bearer' })
      .set('X-Tenant-Id', tenantId)
      .send({ ...input, title: ` ${input.title} ` })
      .expect(201);
    expect(created.body).toMatchObject({
      ...input,
      tenantId,
      status: 'draft',
      startsAt: null,
      endsAt: null,
    });
    const id: unknown = created.body.id;
    if (typeof id !== 'string') throw new Error('Expected id');
    await request(app.getHttpServer())
      .get(`${path}/${id}`)
      .auth(operatorToken, { type: 'bearer' })
      .expect(200);
    const updated = await request(app.getHttpServer())
      .patch(`${path}/${id}`)
      .auth(operatorToken, { type: 'bearer' })
      .send({ title: 'Judul Baru', startsAt: '2026-01-01T08:00:00+07:00' })
      .expect(200);
    expect(updated.body).toMatchObject({
      title: 'Judul Baru',
      content: input.content,
      startsAt: '2026-01-01T01:00:00.000Z',
      status: 'active',
    });
    await request(app.getHttpServer())
      .delete(`${path}/${id}`)
      .auth(operatorToken, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer())
      .get(`${path}/${id}`)
      .auth(operatorToken, { type: 'bearer' })
      .expect(404);
  });

  it('validates text, roles, explicit timezone, dates and unknown fields', async () => {
    for (const body of [
      { ...input, title: '   ' },
      { ...input, title: 'x'.repeat(151) },
      { ...input, content: ' ' },
      { ...input, content: 'x'.repeat(10_001) },
      { ...input, targetRole: 'student' },
      { ...input, tenantId: otherTenantId },
      { ...input, startsAt: '2026-02-30T08:00:00+07:00' },
      { ...input, startsAt: '2026-10-27T08:00:00' },
      { ...input, endsAt: '2026-10-27T08:00:00+07:00' },
      {
        ...input,
        startsAt: '2026-10-27T08:00:00+07:00',
        endsAt: '2026-10-27T08:00:00+07:00',
      },
    ])
      await request(app.getHttpServer())
        .post(path)
        .auth(operatorToken, { type: 'bearer' })
        .send(body)
        .expect(400);
    await request(app.getHttpServer())
      .get(path)
      .auth(operatorToken, { type: 'bearer' })
      .query({ limit: 101 })
      .expect(400);
    await request(app.getHttpServer())
      .get(`${path}/not-a-uuid`)
      .auth(operatorToken, { type: 'bearer' })
      .expect(400);
  });

  it('preserves omitted schedule fields and supports returning to Draft', async () => {
    const announcement = await seed({
      startsAt: '2026-01-01T01:00:00.000Z',
      endsAt: '2030-01-01T01:00:00.000Z',
    });
    const url = `${path}/${announcement.id}`;
    const updated = await request(app.getHttpServer())
      .patch(url)
      .auth(operatorToken, { type: 'bearer' })
      .send({ content: 'Isi baru' })
      .expect(200);
    expect(updated.body).toMatchObject({
      startsAt: announcement.startsAt,
      endsAt: announcement.endsAt,
    });
    await request(app.getHttpServer())
      .patch(url)
      .auth(operatorToken, { type: 'bearer' })
      .send({ startsAt: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(url)
      .auth(operatorToken, { type: 'bearer' })
      .send({ title: null })
      .expect(400);
    const draft = await request(app.getHttpServer())
      .patch(url)
      .auth(operatorToken, { type: 'bearer' })
      .send({ startsAt: null, endsAt: null })
      .expect(200);
    expect(draft.body).toMatchObject({
      status: 'draft',
      startsAt: null,
      endsAt: null,
      content: 'Isi baru',
    });
  });

  it('searches literal titles, filters exact targets and paginates', async () => {
    await seed({
      title: 'Briefing 100% Tentor',
      targetRole: AnnouncementTargetRole.Tutor,
    });
    await seed({
      title: 'Briefing Admin',
      targetRole: AnnouncementTargetRole.Admin,
    });
    await seed({
      title: 'Agenda lain',
      targetRole: AnnouncementTargetRole.Tutor,
    });
    const filtered = await request(app.getHttpServer())
      .get(path)
      .auth(operatorToken, { type: 'bearer' })
      .query({ search: 'Briefing', targetRole: 'tutor', limit: 1, page: 1 })
      .expect(200);
    expect(filtered.body).toMatchObject({
      data: [{ title: 'Briefing 100% Tentor' }],
      meta: { total: 1, totalPages: 1, page: 1, limit: 1 },
    });
    const literal = await request(app.getHttpServer())
      .get(path)
      .auth(operatorToken, { type: 'bearer' })
      .query({ search: '%' })
      .expect(200);
    expect(literal.body.meta.total).toBe(1);
    const page = await request(app.getHttpServer())
      .get(path)
      .auth(operatorToken, { type: 'bearer' })
      .query({ page: 2, limit: 2 })
      .expect(200);
    expect(page.body.meta).toMatchObject({ total: 3, totalPages: 2 });
    expect(page.body.data).toHaveLength(1);
  });

  it('enforces menu permissions for every management operation', async () => {
    const announcement = await seed();
    for (const token of [deniedToken, tutorToken, parentToken]) {
      await request(app.getHttpServer())
        .get(path)
        .auth(token, { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .get(`${path}/${announcement.id}`)
        .auth(token, { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .post(path)
        .auth(token, { type: 'bearer' })
        .send(input)
        .expect(403);
      await request(app.getHttpServer())
        .patch(`${path}/${announcement.id}`)
        .auth(token, { type: 'bearer' })
        .send({ title: 'Changed' })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`${path}/${announcement.id}`)
        .auth(token, { type: 'bearer' })
        .expect(403);
    }
  });

  it('isolates list, detail, active feed, patch and delete across tenants', async () => {
    const announcement = await seed({ startsAt: '2026-01-01T01:00:00.000Z' });
    const foreign = await seed({
      tenantId: otherTenantId,
      title: 'Other tenant',
      startsAt: '2026-01-01T01:00:00.000Z',
    });
    const list = await request(app.getHttpServer())
      .get(path)
      .auth(operatorToken, { type: 'bearer' })
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    const active = await request(app.getHttpServer())
      .get(`${path}/active`)
      .auth(tutorToken, { type: 'bearer' })
      .expect(200);
    expect(active.body.data).toHaveLength(1);
    expect(active.body.data[0].id).toBe(announcement.id);
    for (const method of ['get', 'patch', 'delete'] as const) {
      await request(app.getHttpServer())
        [method](`${path}/${foreign.id}`)
        .auth(operatorToken, { type: 'bearer' })
        .expect(404);
      await request(app.getHttpServer())
        [method](`${path}/${announcement.id}`)
        .auth(ownerToken, { type: 'bearer' })
        .set('X-Tenant-Id', otherTenantId)
        .expect(404);
    }
    await request(app.getHttpServer())
      .get(path)
      .auth(operatorToken, { type: 'bearer' })
      .set('X-Tenant-Id', otherTenantId)
      .expect(403);
    await request(app.getHttpServer())
      .get(path)
      .auth(ownerToken, { type: 'bearer' })
      .set('X-Tenant-Id', randomUUID())
      .expect(403);
  });

  it('returns only currently active matching roles plus All, without management permission', async () => {
    for (const targetRole of Object.values(AnnouncementTargetRole)) {
      await seed({
        title: `Active ${targetRole}`,
        targetRole,
        startsAt: '2026-01-01T01:00:00.000Z',
      });
    }
    await seed({ title: 'Draft' });
    await seed({ title: 'Scheduled', startsAt: '2099-01-01T00:00:00.000Z' });
    await seed({
      title: 'Expired',
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2020-02-01T00:00:00.000Z',
    });
    for (const [token, target] of [
      [operatorToken, 'admin'],
      [deniedToken, 'admin'],
      [tutorToken, 'tutor'],
      [parentToken, 'parent'],
      [ownerToken, 'admin'],
    ]) {
      const result = await request(app.getHttpServer())
        .get(`${path}/active`)
        .auth(token, { type: 'bearer' })
        .set('X-Tenant-Id', tenantId)
        .expect(200);
      expect(
        result.body.data
          .map((item: { targetRole: string }) => item.targetRole)
          .sort(),
      ).toEqual(['all', target].sort());
      expect(
        result.body.data.every(
          (item: { status: string }) => item.status === 'active',
        ),
      ).toBe(true);
    }
  });

  it('orders the active feed by latest start and supports pagination', async () => {
    await seed({ title: 'Old', startsAt: '2025-01-01T00:00:00.000Z' });
    await seed({ title: 'New', startsAt: '2026-01-01T00:00:00.000Z' });
    const result = await request(app.getHttpServer())
      .get(`${path}/active`)
      .auth(parentToken, { type: 'bearer' })
      .query({ limit: 1 })
      .expect(200);
    expect(result.body).toMatchObject({
      data: [{ title: 'New' }],
      meta: { total: 2, totalPages: 2 },
    });
  });
});
