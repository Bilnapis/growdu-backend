import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApplication } from './../src/app.setup.js';
import { AuthSessionEntity } from './../src/auth/entities/auth-session.entity.js';
import { EntityStatus } from './../src/common/enums/entity-status.enum.js';
import { PasswordHashService } from './../src/common/security/password-hash.service.js';
import { ParentEntity } from './../src/parents/entities/parent.entity.js';
import {
  ParentRelationship,
  StudentParentEntity,
} from './../src/students/entities/student-parent.entity.js';
import {
  StudentEntity,
  StudentGender,
} from './../src/students/entities/student.entity.js';
import { TenantEntity } from './../src/tenants/entities/tenant.entity.js';
import { TutorEntity } from './../src/tutors/entities/tutor.entity.js';
import { UserEntity, UserRole } from './../src/users/entities/user.entity.js';

interface LoginResult {
  accessToken: string;
  cookie: string;
  role: UserRole;
}

interface SeedIds {
  tenantId: string;
  tutorId: string;
  parentId: string;
  studentId: string;
  otherTenantStudentId: string;
  secondaryParentId: string;
}

const password = 'StrongPassword!123';
const changedPassword = 'ChangedPassword!456';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ids: SeedIds;
  const sessions = new Map<UserRole, LoginResult>();

  function cookieFrom(headers: Record<string, unknown>): string {
    const value = headers['set-cookie'];
    if (!Array.isArray(value) || typeof value[0] !== 'string') {
      throw new Error('Expected a refresh cookie');
    }
    return value[0].split(';')[0];
  }

  async function login(email: string, loginPassword = password) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: loginPassword });
    return {
      response,
      cookie:
        response.status === 200 ? cookieFrom(response.headers) : undefined,
    };
  }

  beforeAll(async () => {
    app = await NestFactory.create<INestApplication<App>>(AppModule, {
      logger: false,
    });
    configureApplication(app);
    await app.init();

    dataSource = app.get(DataSource);
    const passwordHashService = app.get(PasswordHashService);
    const passwordHash = await passwordHashService.hash(password);

    ids = await dataSource.transaction(async (manager) => {
      const tenant = await manager.save(
        manager.create(TenantEntity, {
          name: 'GrowDu E2E',
          address: null,
          whatsappNumber: null,
          email: null,
          logoUrl: null,
          status: EntityStatus.Active,
        }),
      );
      const otherTenant = await manager.save(
        manager.create(TenantEntity, {
          name: 'Other Tenant',
          address: null,
          whatsappNumber: null,
          email: null,
          logoUrl: null,
          status: EntityStatus.Active,
        }),
      );

      const createUser = (email: string, role: UserRole) =>
        manager.create(UserEntity, {
          tenantId: tenant.id,
          email,
          passwordHash,
          role,
          status: EntityStatus.Active,
          lastLoginAt: null,
        });
      const owner = await manager.save(
        createUser('owner@example.com', UserRole.Owner),
      );
      await manager.save(createUser('admin@example.com', UserRole.Admin));
      await manager.save(
        createUser('password-admin@example.com', UserRole.Admin),
      );
      const tutorUser = await manager.save(
        createUser('tutor@example.com', UserRole.Tutor),
      );
      const parentUser = await manager.save(
        createUser('parent@example.com', UserRole.Parent),
      );

      const tutor = await manager.save(
        manager.create(TutorEntity, {
          tenantId: tenant.id,
          userId: tutorUser.id,
          name: 'Tutor E2E',
          phoneNumber: '081200000001',
          sessionRate: '150000.00',
          status: EntityStatus.Active,
        }),
      );
      const parent = await manager.save(
        manager.create(ParentEntity, {
          tenantId: tenant.id,
          userId: parentUser.id,
          name: 'Parent E2E',
          phoneNumber: '081200000002',
          contactEmail: 'parent-contact@example.com',
          status: EntityStatus.Active,
        }),
      );
      const secondaryParent = await manager.save(
        manager.create(ParentEntity, {
          tenantId: tenant.id,
          userId: null,
          name: 'Secondary Parent',
          phoneNumber: '081200000003',
          contactEmail: 'secondary-parent@example.com',
          status: EntityStatus.Active,
        }),
      );
      const student = await manager.save(
        manager.create(StudentEntity, {
          tenantId: tenant.id,
          studentCode: 'STUD-001',
          name: 'Student E2E',
          gender: StudentGender.Female,
          educationLevel: 'SMP',
          school: 'SMP GrowDu',
          phoneNumber: null,
          address: 'Jakarta',
          status: EntityStatus.Active,
        }),
      );
      const inactiveStudent = await manager.save(
        manager.create(StudentEntity, {
          tenantId: tenant.id,
          studentCode: 'STUD-002',
          name: 'Inactive Student',
          gender: StudentGender.Male,
          educationLevel: 'SMA',
          school: 'SMA GrowDu',
          phoneNumber: null,
          address: 'Jakarta',
          status: EntityStatus.Inactive,
        }),
      );
      const otherTenantStudent = await manager.save(
        manager.create(StudentEntity, {
          tenantId: otherTenant.id,
          studentCode: 'STUD-001',
          name: 'Other Tenant Student',
          gender: StudentGender.Male,
          educationLevel: 'SD',
          school: 'Other School',
          phoneNumber: null,
          address: 'Bandung',
          status: EntityStatus.Active,
        }),
      );

      await manager.save(
        manager.create(StudentParentEntity, {
          tenantId: tenant.id,
          studentId: student.id,
          parentId: parent.id,
          relationship: ParentRelationship.Mother,
          isPrimary: true,
          accessStatus: EntityStatus.Active,
        }),
      );
      await manager.save(
        manager.create(StudentParentEntity, {
          tenantId: tenant.id,
          studentId: inactiveStudent.id,
          parentId: parent.id,
          relationship: ParentRelationship.Mother,
          isPrimary: false,
          accessStatus: EntityStatus.Active,
        }),
      );

      return {
        tenantId: tenant.id,
        ownerId: owner.id,
        tutorId: tutor.id,
        parentId: parent.id,
        studentId: student.id,
        otherTenantStudentId: otherTenantStudent.id,
        secondaryParentId: secondaryParent.id,
      };
    });

    const accounts: Array<[UserRole, string]> = [
      [UserRole.Owner, 'owner@example.com'],
      [UserRole.Admin, 'admin@example.com'],
      [UserRole.Tutor, 'tutor@example.com'],
      [UserRole.Parent, 'parent@example.com'],
    ];
    for (const [role, email] of accounts) {
      const result = await login(email);
      if (result.response.status !== 200 || !result.cookie) {
        throw new Error(`Could not log in seeded ${role}`);
      }
      sessions.set(role, {
        accessToken: result.response.body.accessToken as string,
        cookie: result.cookie,
        role: result.response.body.user.role as UserRole,
      });
    }
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect({ service: 'growdu-backend', status: 'ok' });
  });

  it('/admin (GET)', () => {
    return request(app.getHttpServer())
      .get('/admin')
      .expect(302)
      .expect('Location', '/admin/login');
  });

  it('/admin/login (GET)', () => {
    return request(app.getHttpServer())
      .get('/admin/login')
      .expect(200)
      .expect(/Growdu Admin/);
  });

  it('/docs (GET)', () => {
    return request(app.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect(/Growdu Backend Admin/);
  });

  it('protects domain routes with bearer authentication', () => {
    return request(app.getHttpServer()).get('/api/v1/tenants/me').expect(401);
  });

  it('rejects non-whitelisted request properties', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'owner@example.com',
        password: 'a-valid-password',
        tenantId: 'must-not-be-accepted',
      })
      .expect(400);
  });

  it('requires a refresh cookie', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .expect(401);
  });

  it('rejects refresh requests from an origin outside the allowlist', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://malicious.example')
      .expect(403);
  });

  it('logs in owner, admin, tutor, and parent accounts', () => {
    expect([...sessions.values()].map((session) => session.role)).toEqual([
      UserRole.Owner,
      UserRole.Admin,
      UserRole.Tutor,
      UserRole.Parent,
    ]);
    for (const session of sessions.values()) {
      expect(session.accessToken).toEqual(expect.any(String));
      expect(session.cookie).toContain('growdu_refresh_token=');
    }
  });

  it('rotates refresh tokens and revokes a session when an old token is reused', async () => {
    const loginResult = await login('owner@example.com');
    expect(loginResult.response.status).toBe(200);
    expect(loginResult.cookie).toBeDefined();

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', loginResult.cookie ?? '')
      .expect(200);
    const rotatedCookie = cookieFrom(refreshed.headers);
    expect(rotatedCookie).not.toBe(loginResult.cookie);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', loginResult.cookie ?? '')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', rotatedCookie)
      .expect(401);
  });

  it('logs out and revokes the cookie-backed session', async () => {
    const loginResult = await login('owner@example.com');
    expect(loginResult.cookie).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', loginResult.cookie ?? '')
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', loginResult.cookie ?? '')
      .expect(401);
  });

  it('rejects an expired session even when the JWT itself is valid', async () => {
    const loginResult = await login('owner@example.com');
    const accessToken = loginResult.response.body.accessToken as string;
    const payload = app.get(JwtService).decode<{ sid: string }>(accessToken);
    await dataSource.getRepository(AuthSessionEntity).update(payload.sid, {
      expiresAt: new Date(Date.now() - 1_000),
    });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('enforces the owner/admin/tutor/parent access matrix', async () => {
    const owner = sessions.get(UserRole.Owner);
    const admin = sessions.get(UserRole.Admin);
    const tutor = sessions.get(UserRole.Tutor);
    const parent = sessions.get(UserRole.Parent);
    if (!owner || !admin || !tutor || !parent)
      throw new Error('Missing session');

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/tutors')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/tutors/me')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(ids.tutorId));
    await request(app.getHttpServer())
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/parents/me/students')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].student.id).toBe(ids.studentId);
      });
  });

  it('returns 404 for a record owned by another tenant', async () => {
    const owner = sessions.get(UserRole.Owner);
    if (!owner) throw new Error('Missing owner session');

    await request(app.getHttpServer())
      .get(`/api/v1/students/${ids.otherTenantStudentId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });

  it('enforces unique student codes within a tenant', async () => {
    const owner = sessions.get(UserRole.Owner);
    if (!owner) throw new Error('Missing owner session');

    await request(app.getHttpServer())
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        studentCode: 'STUD-001',
        name: 'Duplicate Student',
        gender: StudentGender.Male,
        educationLevel: 'SD',
        school: 'Duplicate School',
        address: 'Jakarta',
      })
      .expect(409);
  });

  it('moves and removes the primary parent relation transactionally', async () => {
    const owner = sessions.get(UserRole.Owner);
    if (!owner) throw new Error('Missing owner session');

    await request(app.getHttpServer())
      .post(`/api/v1/students/${ids.studentId}/parents`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        parentId: ids.secondaryParentId,
        relationship: ParentRelationship.Father,
        isPrimary: true,
      })
      .expect(201)
      .expect(({ body }) => expect(body.isPrimary).toBe(true));

    await request(app.getHttpServer())
      .get(`/api/v1/students/${ids.studentId}/parents`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(2);
        expect(
          body.filter((relation: { isPrimary: boolean }) => relation.isPrimary),
        ).toHaveLength(1);
      });

    await request(app.getHttpServer())
      .delete(
        `/api/v1/students/${ids.studentId}/parents/${ids.secondaryParentId}`,
      )
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);
  });

  it('changes a password, revokes all sessions, and supports logout-all', async () => {
    const first = await login('password-admin@example.com');
    expect(first.response.status).toBe(200);
    const firstToken = first.response.body.accessToken as string;

    await request(app.getHttpServer())
      .patch('/api/v1/auth/password')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ currentPassword: password, newPassword: changedPassword })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(401);
    expect((await login('password-admin@example.com')).response.status).toBe(
      401,
    );

    const second = await login('password-admin@example.com', changedPassword);
    const third = await login('password-admin@example.com', changedPassword);
    expect(second.response.status).toBe(200);
    expect(third.response.status).toBe(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set(
        'Authorization',
        `Bearer ${second.response.body.accessToken as string}`,
      )
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', third.cookie ?? '')
      .expect(401);
  });

  it('rate-limits repeated login failures per IP and email', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'rate-limit@example.com', password });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  afterAll(async () => {
    await app.close();
  });
});
