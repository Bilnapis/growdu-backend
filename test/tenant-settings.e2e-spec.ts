import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/app.setup.js';
import { EntityStatus } from '../src/common/enums/entity-status.enum.js';
import { PasswordHashService } from '../src/common/security/password-hash.service.js';
import { OperatorEntity } from '../src/operators/entities/operator.entity.js';
import { OperatorMenu } from '../src/operators/menu-permissions.js';
import { OwnerEntity } from '../src/owners/entities/owner.entity.js';
import { TenantEntity } from '../src/tenants/entities/tenant.entity.js';
import { TutorEntity } from '../src/tutors/entities/tutor.entity.js';
import { UserEntity, UserRole } from '../src/users/entities/user.entity.js';

const password = 'abc12';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
  'base64',
);

describe('Tenant settings API (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let foreignTenantId: string;
  let ownerToken: string;
  let operatorToken: string;
  let blockedToken: string;
  let tutorToken: string;
  const uploads: string[] = [];

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const body: unknown = response.body;
    if (
      !body ||
      typeof body !== 'object' ||
      !('accessToken' in body) ||
      typeof body.accessToken !== 'string'
    )
      throw new Error('Missing access token');
    return body.accessToken;
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
    const createUser = (
      role: UserRole,
      email: string,
      userTenantId: string | null,
    ) =>
      manager.save(
        manager.create(UserEntity, {
          email,
          role,
          tenantId: userTenantId,
          passwordHash,
          status: EntityStatus.Active,
        }),
      );
    const ownerUser = await createUser(
      UserRole.Owner,
      'settings-owner@example.com',
      null,
    );
    const owner = await manager.save(
      manager.create(OwnerEntity, {
        userId: ownerUser.id,
        name: 'Settings Owner',
        phoneNumber: '081234567890',
        status: EntityStatus.Active,
      }),
    );
    const tenant = await manager.save(
      manager.create(TenantEntity, {
        ownerId: owner.id,
        name: 'Settings Bimbel',
        status: EntityStatus.Active,
      }),
    );
    tenantId = tenant.id;
    const otherUser = await createUser(
      UserRole.Owner,
      'settings-other@example.com',
      null,
    );
    const otherOwner = await manager.save(
      manager.create(OwnerEntity, {
        userId: otherUser.id,
        name: 'Other Owner',
        phoneNumber: '081234567899',
        status: EntityStatus.Active,
      }),
    );
    foreignTenantId = (
      await manager.save(
        manager.create(TenantEntity, {
          ownerId: otherOwner.id,
          name: 'Foreign Bimbel',
          status: EntityStatus.Active,
        }),
      )
    ).id;
    for (const [email, permissions] of [
      ['settings-operator@example.com', [OperatorMenu.Settings]],
      ['settings-blocked@example.com', []],
    ] as const) {
      const user = await createUser(UserRole.Operator, email, tenantId);
      await manager.save(
        manager.create(OperatorEntity, {
          userId: user.id,
          tenantId,
          name: 'Operator',
          phoneNumber: '081234567891',
          menuPermissions: [...permissions],
          status: EntityStatus.Active,
        }),
      );
    }
    const tutorUser = await createUser(
      UserRole.Tutor,
      'settings-tutor@example.com',
      tenantId,
    );
    await manager.save(
      manager.create(TutorEntity, {
        userId: tutorUser.id,
        tenantId,
        name: 'Tutor',
        phoneNumber: '081234567892',
        sessionRate: '0',
        status: EntityStatus.Active,
      }),
    );
    ownerToken = await login(ownerUser.email);
    operatorToken = await login('settings-operator@example.com');
    blockedToken = await login('settings-blocked@example.com');
    tutorToken = await login(tutorUser.email);
  });

  afterAll(async () => {
    for (const filename of uploads)
      await unlink(join(process.cwd(), 'uploads', 'tenant-logos', filename));
    await app?.close();
  });

  const patch = (token: string, input: object, requestedTenantId = tenantId) =>
    request(app.getHttpServer())
      .patch('/api/v1/tenants/me')
      .auth(token, { type: 'bearer' })
      .set('X-Tenant-Id', requestedTenantId)
      .send(input);

  it('requires authentication and a tenant selection for owners', async () => {
    await request(app.getHttpServer()).get('/api/v1/tenants/me').expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/tenants/me')
      .send({ name: 'Blocked' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/tenants/me/logo')
      .attach('file', png, 'logo.png')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/tenants/me')
      .auth(ownerToken, { type: 'bearer' })
      .expect(403);
  });

  it('returns defaults for existing tenants and normalizes owner updates', async () => {
    const initial = await request(app.getHttpServer())
      .get('/api/v1/tenants/me')
      .auth(ownerToken, { type: 'bearer' })
      .set('X-Tenant-Id', tenantId)
      .expect(200);
    expect(initial.body).toMatchObject({
      websiteUrl: null,
      primaryColor: '#1F8FE5',
    });
    const saved = await patch(ownerToken, {
      name: ' Updated Bimbel ',
      websiteUrl: ' https://bimbel.id ',
      primaryColor: ' #7a5af8 ',
    }).expect(200);
    expect(saved.body).toMatchObject({
      name: 'Updated Bimbel',
      websiteUrl: 'https://bimbel.id',
      primaryColor: '#7A5AF8',
    });
    const owned = await request(app.getHttpServer())
      .get('/api/v1/tenants/owned')
      .auth(ownerToken, { type: 'bearer' })
      .expect(200);
    expect(owned.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: tenantId, primaryColor: '#7A5AF8' }),
      ]),
    );
  });

  it('allows a permitted operator to update one setting and clear optional contacts', async () => {
    const response = await patch(operatorToken, {
      primaryColor: '#12B76A',
      websiteUrl: null,
      email: null,
      address: null,
      whatsappNumber: null,
    }).expect(200);
    expect(response.body).toMatchObject({
      name: 'Updated Bimbel',
      primaryColor: '#12B76A',
      websiteUrl: null,
    });
  });

  it('rejects operators without settings access and gives tutors read-only access', async () => {
    await patch(blockedToken, { name: 'Blocked' }).expect(403);
    await patch(tutorToken, { primaryColor: '#FFFFFF' }).expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/tenants/me')
      .auth(tutorToken, { type: 'bearer' })
      .expect(200);
    for (const token of [blockedToken, tutorToken])
      await request(app.getHttpServer())
        .post('/api/v1/tenants/me/logo')
        .auth(token, { type: 'bearer' })
        .attach('file', png, 'logo.png')
        .expect(403);
  });

  it('rejects foreign tenant reads, updates and uploads', async () => {
    for (const token of [ownerToken, operatorToken]) {
      await patch(token, { name: 'Blocked' }, foreignTenantId).expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/tenants/me')
        .auth(token, { type: 'bearer' })
        .set('X-Tenant-Id', foreignTenantId)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/tenants/me/logo')
        .auth(token, { type: 'bearer' })
        .set('X-Tenant-Id', foreignTenantId)
        .attach('file', png, 'logo.png')
        .expect(403);
    }
    await patch(ownerToken, { name: 'Blocked' }, randomUUID()).expect(403);
  });

  it.each([
    { name: null },
    { primaryColor: null },
    { primaryColor: '#FFF' },
    { websiteUrl: 'javascript:alert(1)' },
    { ownerId: 'invalid' },
  ])('rejects invalid and unexpected fields: %j', async (input) => {
    await patch(ownerToken, input).expect(400);
  });

  it('stages a logo and attaches it only after a successful update', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tenants/me/logo')
      .auth(operatorToken, { type: 'bearer' })
      .attach('file', png, 'logo.png')
      .expect(201);
    const body: unknown = response.body;
    if (
      !body ||
      typeof body !== 'object' ||
      !('logoUrl' in body) ||
      typeof body.logoUrl !== 'string'
    )
      throw new Error('Missing logo URL');
    const filename = new URL(body.logoUrl).pathname.split('/').at(-1);
    if (!filename || !/^[0-9a-f-]+\.png$/.test(filename))
      throw new Error('Unexpected upload path');
    uploads.push(filename);
    expect(
      (
        await dataSource
          .getRepository(TenantEntity)
          .findOneByOrFail({ id: tenantId })
      ).logoUrl,
    ).toBeNull();
    await patch(operatorToken, { logoUrl: body.logoUrl }).expect(200);
    expect(
      (
        await dataSource
          .getRepository(TenantEntity)
          .findOneByOrFail({ id: tenantId })
      ).logoUrl,
    ).toBe(body.logoUrl);
  });

  it('rejects invalid uploads and files larger than 2 MB', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tenants/me/logo')
      .auth(operatorToken, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/tenants/me/logo')
      .auth(operatorToken, { type: 'bearer' })
      .attach('file', Buffer.from('invalid'), 'logo.png')
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/tenants/me/logo')
      .auth(operatorToken, { type: 'bearer' })
      .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1), 'logo.png')
      .expect(413);
  });

  it('preserves independently submitted identity and theme in concurrent updates', async () => {
    await Promise.all([
      patch(ownerToken, {
        name: 'Concurrent Bimbel',
        websiteUrl: 'https://concurrent.id',
      }).expect(200),
      patch(operatorToken, { primaryColor: '#FFFFFF' }).expect(200),
    ]);
    const tenant = await dataSource
      .getRepository(TenantEntity)
      .findOneByOrFail({ id: tenantId });
    expect(tenant).toMatchObject({
      name: 'Concurrent Bimbel',
      websiteUrl: 'https://concurrent.id',
      primaryColor: '#FFFFFF',
    });
  });
});
