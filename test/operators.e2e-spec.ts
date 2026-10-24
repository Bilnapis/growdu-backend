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

const password = 'abc12';
const staffInput = {
  name: 'Pegawai Baru',
  phoneNumber: '081234567890',
  email: 'staff-e2e@example.com',
  password,
  address: 'Jl. Melati 12',
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
    });
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
    const operator = await dataSource
      .getRepository(OperatorEntity)
      .findOneByOrFail({ tenantId, name: staffInput.name });
    operatorId = operator.id;
    expect(operator.address).toBe(staffInput.address);
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
  });
});
