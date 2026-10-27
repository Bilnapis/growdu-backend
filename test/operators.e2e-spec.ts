import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/app.setup.js';
import { PasswordHashService } from '../src/common/security/password-hash.service.js';
import { EntityStatus } from '../src/common/enums/entity-status.enum.js';
import { OwnerEntity } from '../src/owners/entities/owner.entity.js';
import { TenantEntity } from '../src/tenants/entities/tenant.entity.js';
import { UserEntity, UserRole } from '../src/users/entities/user.entity.js';
import { OperatorEntity } from '../src/operators/entities/operator.entity.js';
import { OperatorMenu } from '../src/operators/menu-permissions.js';
import { RoomEntity } from '../src/rooms/entities/room.entity.js';

const password = 'abc12';
const staffInput = {
  name: 'Pegawai Baru',
  phoneNumber: '081234567890',
  email: 'staff-e2e@example.com',
  password,
  address: 'Jl. Melati 12',
  menuPermissions: [OperatorMenu.Students, OperatorMenu.Schedule],
};

describe('Staff operator API (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let otherTenantId: string;
  let ownerToken: string;
  let operatorId: string;

  async function login(email: string): Promise<string> {
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const body: unknown = result.body;
    if (
      typeof body !== 'object' ||
      body === null ||
      !('accessToken' in body) ||
      typeof body.accessToken !== 'string'
    )
      throw new Error('Expected login token');
    return body.accessToken;
  }

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
    });
    configureApplication(app);
    await app.init();
    dataSource = app.get(DataSource);
    const passwordHash = await app.get(PasswordHashService).hash(password);
    for (const [index, email] of [
      'staff-owner@example.com',
      'staff-other-owner@example.com',
    ].entries()) {
      const user = await dataSource.manager.save(
        dataSource.manager.create(UserEntity, {
          email,
          passwordHash,
          tenantId: null,
          role: UserRole.Owner,
          status: EntityStatus.Active,
        }),
      );
      const owner = await dataSource.manager.save(
        dataSource.manager.create(OwnerEntity, {
          userId: user.id,
          name: 'Owner',
          phoneNumber: '081234567890',
          status: EntityStatus.Active,
        }),
      );
      const tenant = await dataSource.manager.save(
        dataSource.manager.create(TenantEntity, {
          ownerId: owner.id,
          name: `Staff Test ${index}`,
          status: EntityStatus.Active,
        }),
      );
      if (index === 0) tenantId = tenant.id;
      else otherTenantId = tenant.id;
    }
    ownerToken = await login('staff-owner@example.com');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication and rejects access to another owner tenant', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenantId}/operators`)
      .send(staffInput)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${otherTenantId}/operators`)
      .auth(ownerToken, { type: 'bearer' })
      .send(staffInput)
      .expect(403);
  });

  it('rejects invalid input without creating an account', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenantId}/operators`)
      .auth(ownerToken, { type: 'bearer' })
      .send({ ...staffInput, password: '1234', address: 'a'.repeat(1001) })
      .expect(400);
    expect(
      await dataSource
        .getRepository(UserEntity)
        .countBy({ email: staffInput.email }),
    ).toBe(0);
  });

  it('creates an active login and profile, preserves address, and hides password', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenantId}/operators`)
      .auth(ownerToken, { type: 'bearer' })
      .send(staffInput)
      .expect(201);
    expect(response.body).toMatchObject({
      name: staffInput.name,
      address: staffInput.address,
      email: staffInput.email,
      status: 'active',
      tenantId,
      menuPermissions: staffInput.menuPermissions,
    });
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
    const operator = await dataSource
      .getRepository(OperatorEntity)
      .findOneByOrFail({ tenantId, name: staffInput.name });
    operatorId = operator.id;
    expect(operator.address).toBe(staffInput.address);
    expect(operator.menuPermissions).toEqual(staffInput.menuPermissions);
    const user = await dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: operator.userId })
      .getOneOrFail();
    expect(user.passwordHash).not.toBe(password);
    expect(
      await app.get(PasswordHashService).verify(user.passwordHash, password),
    ).toBe(true);
  });

  it('prevents duplicate email and lists the new staff member using search and status', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenantId}/operators`)
      .auth(ownerToken, { type: 'bearer' })
      .send(staffInput)
      .expect(409);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenantId}/operators`)
      .query({ search: 'Pegawai Baru', status: 'active', page: 1, limit: 10 })
      .auth(ownerToken, { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({
      data: [{ id: operatorId, address: staffInput.address }],
      meta: { total: 1 },
    });
    expect(
      await dataSource
        .getRepository(UserEntity)
        .countBy({ email: staffInput.email }),
    ).toBe(1);
  });

  it('allows the new staff account to log in but not manage other staff', async () => {
    const token = await login(staffInput.email);
    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenantId}/operators`)
      .auth(token, { type: 'bearer' })
      .send({ ...staffInput, email: 'forbidden@example.com' })
      .expect(403);
    await request(app.getHttpServer())
      .put(
        `/api/v1/tenants/${tenantId}/operators/${operatorId}/menu-permissions`,
      )
      .auth(token, { type: 'bearer' })
      .send({ menuPermissions: Object.values(OperatorMenu) })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/tenants/${tenantId}/operators/${operatorId}`)
      .auth(token, { type: 'bearer' })
      .send({
        name: 'Unauthorized',
        menuPermissions: Object.values(OperatorMenu),
      })
      .expect(403);
  });

  it('protects permission updates by authentication, ownership, and tenant membership', async () => {
    const path = `/api/v1/tenants/${tenantId}/operators/${operatorId}/menu-permissions`;
    await request(app.getHttpServer())
      .put(path)
      .send({ menuPermissions: [] })
      .expect(401);
    const otherOwnerToken = await login('staff-other-owner@example.com');
    await request(app.getHttpServer())
      .put(path)
      .auth(otherOwnerToken, { type: 'bearer' })
      .send({ menuPermissions: [] })
      .expect(403);
    await request(app.getHttpServer())
      .put(
        `/api/v1/tenants/${otherTenantId}/operators/${operatorId}/menu-permissions`,
      )
      .auth(otherOwnerToken, { type: 'bearer' })
      .send({ menuPermissions: [] })
      .expect(404);
  });

  it.each([
    {},
    { menuPermissions: null },
    { menuPermissions: ['staff'] },
    { menuPermissions: ['students', 'students'] },
    { menuPermissions: [], role: 'owner' },
  ])(
    'rejects invalid permission updates without changing access: %j',
    async (input) => {
      await request(app.getHttpServer())
        .put(
          `/api/v1/tenants/${tenantId}/operators/${operatorId}/menu-permissions`,
        )
        .auth(ownerToken, { type: 'bearer' })
        .send(input)
        .expect(400);
      const operator = await dataSource
        .getRepository(OperatorEntity)
        .findOneByOrFail({ id: operatorId });
      expect(operator.menuPermissions).toEqual(staffInput.menuPermissions);
    },
  );

  it('applies granted and revoked access immediately to the same active login', async () => {
    const token = await login(staffInput.email);
    const path = `/api/v1/tenants/${tenantId}/operators/${operatorId}/menu-permissions`;
    await request(app.getHttpServer())
      .get('/api/v1/students')
      .auth(token, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .auth(token, { type: 'bearer' })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .put(path)
      .auth(ownerToken, { type: 'bearer' })
      .send({ menuPermissions: [OperatorMenu.Rooms] })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: operatorId,
      menuPermissions: [OperatorMenu.Rooms],
    });
    expect(updated.body).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer())
      .get('/api/v1/students')
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .auth(token, { type: 'bearer' })
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(me.body.menuPermissions).toEqual([OperatorMenu.Rooms]);

    await request(app.getHttpServer())
      .put(path)
      .auth(ownerToken, { type: 'bearer' })
      .send({ menuPermissions: [] })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .auth(token, { type: 'bearer' })
      .expect(403);
    const withoutAccess = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(withoutAccess.body.menuPermissions).toEqual([]);

    // Menu permissions do not change the owner's access to tenant data.
    await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .set('X-Tenant-Id', tenantId)
      .auth(ownerToken, { type: 'bearer' })
      .expect(200);
  });

  it('keeps scheduling and group pickers usable without granting access to other menus', async () => {
    const room = await dataSource.getRepository(RoomEntity).save({
      tenantId,
      name: 'Ruang A',
      code: 'A',
      capacity: 12,
      status: EntityStatus.Active,
    });
    const token = await login(staffInput.email);
    const path = `/api/v1/tenants/${tenantId}/operators/${operatorId}/menu-permissions`;
    await request(app.getHttpServer())
      .put(path)
      .auth(ownerToken, { type: 'bearer' })
      .send({ menuPermissions: [OperatorMenu.Schedule] })
      .expect(200);
    const options = await request(app.getHttpServer())
      .get('/api/v1/class-sessions/form-options')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(options.body).toEqual({
      tutors: [],
      rooms: [{ id: room.id, name: room.name, code: room.code, capacity: 12 }],
    });
    await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .auth(token, { type: 'bearer' })
      .expect(403);

    await request(app.getHttpServer())
      .put(path)
      .auth(ownerToken, { type: 'bearer' })
      .send({ menuPermissions: [OperatorMenu.StudyGroups] })
      .expect(200);
    const groupOptions = await request(app.getHttpServer())
      .get('/api/v1/study-groups/form-options')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(groupOptions.body).toEqual({ ...options.body, students: [] });
    for (const menuPath of [
      '/students',
      '/tutors',
      '/rooms',
      '/class-sessions/form-options',
    ]) {
      await request(app.getHttpServer())
        .get(`/api/v1${menuPath}`)
        .auth(token, { type: 'bearer' })
        .expect(403);
    }
  });

  it('creates accounts with no menu access and retains defaults for older clients', async () => {
    const noAccess = await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenantId}/operators`)
      .auth(ownerToken, { type: 'bearer' })
      .send({
        ...staffInput,
        email: 'no-menu@example.com',
        menuPermissions: [],
      })
      .expect(201);
    expect(noAccess.body.menuPermissions).toEqual([]);
    const token = await login('no-menu@example.com');
    await request(app.getHttpServer())
      .get('/api/v1/students')
      .auth(token, { type: 'bearer' })
      .expect(403);

    const { menuPermissions: _permissions, ...legacyInput } = staffInput;
    const legacy = await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenantId}/operators`)
      .auth(ownerToken, { type: 'bearer' })
      .send({ ...legacyInput, email: 'legacy-menu@example.com' })
      .expect(201);
    expect(legacy.body.menuPermissions).toEqual(Object.values(OperatorMenu));
  });
  it('updates account data and permissions together while preserving omitted permissions', async () => {
    const token = await login(staffInput.email);
    const path = `/api/v1/tenants/${tenantId}/operators/${operatorId}`;
    const response = await request(app.getHttpServer())
      .patch(path)
      .auth(ownerToken, { type: 'bearer' })
      .send({
        name: 'Pegawai Diperbarui',
        address: 'Jl. Baru 10',
        menuPermissions: [OperatorMenu.Rooms],
      })
      .expect(200);
    expect(response.body).toMatchObject({
      id: operatorId,
      name: 'Pegawai Diperbarui',
      address: 'Jl. Baru 10',
      menuPermissions: [OperatorMenu.Rooms],
    });
    expect(response.body).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .auth(token, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/study-groups')
      .auth(token, { type: 'bearer' })
      .expect(403);

    const profileOnly = await request(app.getHttpServer())
      .patch(path)
      .auth(ownerToken, { type: 'bearer' })
      .send({ name: 'Hanya Profil' })
      .expect(200);
    expect(profileOnly.body.menuPermissions).toEqual([OperatorMenu.Rooms]);
  });

  it('rolls back account and permission changes together if the email conflicts', async () => {
    const path = `/api/v1/tenants/${tenantId}/operators/${operatorId}`;
    const before = await dataSource
      .getRepository(OperatorEntity)
      .findOneOrFail({
        where: { id: operatorId },
        relations: { user: true },
      });
    await request(app.getHttpServer())
      .patch(path)
      .auth(ownerToken, { type: 'bearer' })
      .send({
        name: 'Must Not Persist',
        email: 'no-menu@example.com',
        menuPermissions: [],
      })
      .expect(409);
    const after = await dataSource.getRepository(OperatorEntity).findOneOrFail({
      where: { id: operatorId },
      relations: { user: true },
    });
    expect(after.name).toBe(before.name);
    expect(after.user.email).toBe(before.user.email);
    expect(after.menuPermissions).toEqual(before.menuPermissions);

    const cleared = await request(app.getHttpServer())
      .patch(path)
      .auth(ownerToken, { type: 'bearer' })
      .send({ menuPermissions: [] })
      .expect(200);
    expect(cleared.body).toMatchObject({
      name: before.name,
      menuPermissions: [],
    });
  });
});
