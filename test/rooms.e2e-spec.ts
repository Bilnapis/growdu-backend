import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/app.setup.js';
import { PasswordHashService } from '../src/common/security/password-hash.service.js';
import { EntityStatus } from '../src/common/enums/entity-status.enum.js';
import { OperatorEntity } from '../src/operators/entities/operator.entity.js';
import { OwnerEntity } from '../src/owners/entities/owner.entity.js';
import { RoomEntity } from '../src/rooms/entities/room.entity.js';
import { StudyGroupScheduleEntity } from '../src/study-groups/entities/study-group-schedule.entity.js';
import { StudyGroupEntity } from '../src/study-groups/entities/study-group.entity.js';
import { TenantEntity } from '../src/tenants/entities/tenant.entity.js';
import { TutorEntity } from '../src/tutors/entities/tutor.entity.js';
import { UserEntity, UserRole } from '../src/users/entities/user.entity.js';

const password = 'abc12';

describe('Rooms API (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let ownerToken: string;
  let operatorToken: string;
  let roomId: string;

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.accessToken as string;
  }

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
    });
    configureApplication(app);
    await app.init();
    dataSource = app.get(DataSource);
    const passwordHash = await app.get(PasswordHashService).hash(password);

    const ownerUser = await dataSource.manager.save(
      dataSource.manager.create(UserEntity, {
        email: 'rooms-owner@example.com',
        passwordHash,
        tenantId: null,
        role: UserRole.Owner,
        status: EntityStatus.Active,
      }),
    );
    const owner = await dataSource.manager.save(
      dataSource.manager.create(OwnerEntity, {
        userId: ownerUser.id,
        name: 'Rooms Owner',
        phoneNumber: '081234567890',
        status: EntityStatus.Active,
      }),
    );
    const tenant = await dataSource.manager.save(
      dataSource.manager.create(TenantEntity, {
        ownerId: owner.id,
        name: 'Rooms Tenant',
        address: null,
        whatsappNumber: null,
        email: null,
        logoUrl: null,
        status: EntityStatus.Active,
      }),
    );
    tenantId = tenant.id;
    const operatorUser = await dataSource.manager.save(
      dataSource.manager.create(UserEntity, {
        email: 'rooms-operator@example.com',
        passwordHash,
        tenantId,
        role: UserRole.Operator,
        status: EntityStatus.Active,
      }),
    );
    await dataSource.manager.save(
      dataSource.manager.create(OperatorEntity, {
        tenantId,
        userId: operatorUser.id,
        name: 'Rooms Operator',
        phoneNumber: '081234567891',
        address: null,
        status: EntityStatus.Active,
      }),
    );

    ownerToken = await login(ownerUser.email);
    operatorToken = await login(operatorUser.email);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication and tenant context for owners', async () => {
    await request(app.getHttpServer()).get('/api/v1/rooms').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .auth(ownerToken, { type: 'bearer' })
      .expect(403);
  });

  it('creates an active room and normalizes its code', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .set('X-Tenant-Id', tenantId)
      .auth(ownerToken, { type: 'bearer' })
      .send({ name: 'Ruang Galileo', code: ' r-01 ', capacity: 12 })
      .expect(201);

    expect(response.body).toMatchObject({
      name: 'Ruang Galileo',
      code: 'R-01',
      capacity: 12,
      status: 'active',
    });
    roomId = response.body.id as string;
  });

  it('rejects duplicate room codes and invalid capacity', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .auth(operatorToken, { type: 'bearer' })
      .send({ name: 'Duplicate', code: 'r-01', capacity: 8 })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .auth(operatorToken, { type: 'bearer' })
      .send({ name: 'Invalid', code: 'R-02', capacity: 0 })
      .expect(400);
  });

  it('lists, filters, summarizes, and updates rooms for operators', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .query({
        search: 'Galileo',
        capacityCategory: 'medium',
        status: 'active',
      })
      .auth(operatorToken, { type: 'bearer' })
      .expect(200);
    expect(list.body).toMatchObject({
      data: [{ id: roomId, activeGroupCount: 0, todaySessionCount: 0 }],
      meta: { total: 1 },
    });

    const summary = await request(app.getHttpServer())
      .get('/api/v1/rooms/summary')
      .auth(operatorToken, { type: 'bearer' })
      .expect(200);
    expect(summary.body).toMatchObject({
      activeRooms: 1,
      totalCapacity: 12,
      inactiveRooms: 0,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/rooms/${roomId}`)
      .auth(operatorToken, { type: 'bearer' })
      .send({ capacity: 14 })
      .expect(200)
      .expect((response) => {
        expect(response.body.capacity).toBe(14);
      });

    await dataSource.manager.save([
      dataSource.manager.create(RoomEntity, {
        tenantId,
        name: 'Ruang Kecil',
        code: 'R-08',
        capacity: 8,
        status: EntityStatus.Active,
      }),
      dataSource.manager.create(RoomEntity, {
        tenantId,
        name: 'Ruang Besar',
        code: 'R-16',
        capacity: 16,
        status: EntityStatus.Active,
      }),
    ]);

    const small = await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .query({ capacityCategory: 'small' })
      .auth(operatorToken, { type: 'bearer' })
      .expect(200);
    expect(small.body.data).toHaveLength(1);
    expect(small.body.data[0].capacity).toBe(8);

    const large = await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .query({ capacityCategory: 'large' })
      .auth(operatorToken, { type: 'bearer' })
      .expect(200);
    expect(large.body.data).toHaveLength(1);
    expect(large.body.data[0].capacity).toBe(16);

    await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .query({ page: 2, limit: 1 })
      .auth(operatorToken, { type: 'bearer' })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toHaveLength(1);
        expect(response.body.meta).toMatchObject({
          page: 2,
          limit: 1,
          total: 3,
          totalPages: 3,
        });
      });
  });

  it('prevents deleting a referenced room while allowing deactivation', async () => {
    const tutor = await dataSource.manager.save(
      dataSource.manager.create(TutorEntity, {
        tenantId,
        userId: null,
        name: 'Tutor Ruangan',
        phoneNumber: '081234567892',
        email: null,
        address: null,
        expertise: 'Matematika',
        education: null,
        bankName: null,
        accountName: null,
        accountNumber: null,
        sessionRate: '100000.00',
        status: EntityStatus.Active,
      }),
    );
    const group = await dataSource.manager.save(
      dataSource.manager.create(StudyGroupEntity, {
        tenantId,
        name: 'Kelas Ruangan',
        status: EntityStatus.Active,
      }),
    );
    await dataSource.manager.save(
      dataSource.manager.create(StudyGroupScheduleEntity, {
        tenantId,
        studyGroupId: group.id,
        tutorId: tutor.id,
        roomId,
        dayOfWeek: 1,
        startTime: '15:00:00',
        endTime: '16:30:00',
        sortOrder: 0,
      }),
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/rooms/${roomId}`)
      .auth(operatorToken, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/v1/rooms/${roomId}/status`)
      .auth(operatorToken, { type: 'bearer' })
      .send({ status: 'inactive' })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('inactive');
        expect(response.body.studyGroups).toHaveLength(1);
      });
  });

  it('validates inactive rooms, adjacent schedules, and room conflicts', async () => {
    const tutor = await dataSource.manager.save(
      dataSource.manager.create(TutorEntity, {
        tenantId,
        userId: null,
        name: 'Tutor Jadwal Ruangan',
        phoneNumber: '081234567893',
        email: null,
        address: null,
        expertise: 'Fisika',
        education: null,
        bankName: null,
        accountName: null,
        accountNumber: null,
        sessionRate: '100000.00',
        status: EntityStatus.Active,
      }),
    );
    const adjacentSchedule = {
      name: 'Kelas Jadwal Bersebelahan',
      schedules: [
        {
          tutorId: tutor.id,
          roomId,
          dayOfWeek: 1,
          startTime: '16:30',
          endTime: '17:30',
        },
      ],
      studentIds: [],
    };

    await request(app.getHttpServer())
      .post('/api/v1/study-groups')
      .auth(operatorToken, { type: 'bearer' })
      .send(adjacentSchedule)
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain('Ruangan harus aktif');
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/rooms/${roomId}/status`)
      .auth(operatorToken, { type: 'bearer' })
      .send({ status: 'active' })
      .expect(200);

    const createdAdjacent = await request(app.getHttpServer())
      .post('/api/v1/study-groups')
      .auth(operatorToken, { type: 'bearer' })
      .send(adjacentSchedule)
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/study-groups/${createdAdjacent.body.id}`)
      .auth(operatorToken, { type: 'bearer' })
      .send(adjacentSchedule)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/study-groups')
      .auth(operatorToken, { type: 'bearer' })
      .send({
        name: 'Kelas Jadwal Legacy',
        schedules: [
          {
            tutorId: tutor.id,
            dayOfWeek: 2,
            startTime: '10:00',
            endTime: '11:00',
          },
        ],
        studentIds: [],
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.schedules[0]).toMatchObject({
          roomId: null,
          roomName: null,
          roomCode: null,
        });
      });

    const currentTenant = await dataSource.manager.findOneByOrFail(
      TenantEntity,
      { id: tenantId },
    );
    const foreignTenant = await dataSource.manager.save(
      dataSource.manager.create(TenantEntity, {
        ownerId: currentTenant.ownerId,
        name: 'Tenant Ruangan Lain',
        address: null,
        whatsappNumber: null,
        email: null,
        logoUrl: null,
        status: EntityStatus.Active,
      }),
    );
    const foreignRoom = await dataSource.manager.save(
      dataSource.manager.create(RoomEntity, {
        tenantId: foreignTenant.id,
        name: 'Ruang Tenant Lain',
        code: 'FOREIGN-01',
        capacity: 8,
        status: EntityStatus.Active,
      }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/study-groups')
      .auth(operatorToken, { type: 'bearer' })
      .send({
        name: 'Kelas Ruangan Tenant Lain',
        schedules: [
          {
            tutorId: tutor.id,
            roomId: foreignRoom.id,
            dayOfWeek: 3,
            startTime: '10:00',
            endTime: '11:00',
          },
        ],
        studentIds: [],
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain('berasal dari bimbel ini');
      });

    const otherTutor = await dataSource.manager.save(
      dataSource.manager.create(TutorEntity, {
        tenantId,
        userId: null,
        name: 'Tutor Konflik Ruangan',
        phoneNumber: '081234567894',
        email: null,
        address: null,
        expertise: 'Kimia',
        education: null,
        bankName: null,
        accountName: null,
        accountNumber: null,
        sessionRate: '100000.00',
        status: EntityStatus.Active,
      }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/study-groups')
      .auth(operatorToken, { type: 'bearer' })
      .send({
        name: 'Kelas Konflik Ruangan',
        schedules: [
          {
            tutorId: otherTutor.id,
            roomId,
            dayOfWeek: 1,
            startTime: '16:00',
            endTime: '17:00',
          },
        ],
        studentIds: [],
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.message).toContain('Ruangan sudah digunakan');
      });
  });

  it('deletes an unused room', async () => {
    const unused = await dataSource.manager.save(
      dataSource.manager.create(RoomEntity, {
        tenantId,
        name: 'Ruang Kosong',
        code: 'R-99',
        capacity: 5,
        status: EntityStatus.Active,
      }),
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/rooms/${unused.id}`)
      .auth(operatorToken, { type: 'bearer' })
      .expect(204);
  });
});
