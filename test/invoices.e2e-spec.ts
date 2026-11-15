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
import { EntityStatus } from '../src/common/enums/entity-status.enum.js';
import { jakartaDate, nextBillingPeriod } from '../src/common/jakarta-date.js';
import { PasswordHashService } from '../src/common/security/password-hash.service.js';
import { OwnerEntity } from '../src/owners/entities/owner.entity.js';
import { OperatorEntity } from '../src/operators/entities/operator.entity.js';
import { OperatorMenu } from '../src/operators/menu-permissions.js';
import { TenantEntity } from '../src/tenants/entities/tenant.entity.js';
import { UserEntity, UserRole } from '../src/users/entities/user.entity.js';
import {
  StudentEntity,
  StudentGender,
} from '../src/students/entities/student.entity.js';
import {
  InvoiceEntity,
  InvoiceEventEntity,
  InvoiceItemEntity,
  InvoicePaymentEntity,
  InvoiceSettingsEntity,
} from '../src/invoices/entities/invoice.entity.js';
import { InvoiceGenerationService } from '../src/invoices/invoice-generation.service.js';
import type { InvoiceDetailResponseDto } from '../src/invoices/dto/invoice-response.dto.js';

describe('Invoices API (e2e)', () => {
  let app: NestExpressApplication,
    db: DataSource,
    generation: InvoiceGenerationService;
  let tenantId: string,
    foreignTenantId: string,
    operatorToken: string,
    invoiceOnlyToken: string,
    deniedToken: string,
    ownerToken: string,
    student: StudentEntity;
  let proofDirectory: string;
  const password = 'abc12',
    base = '/api/v1/invoices';
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
    'base64',
  );
  const bank = {
    bankName: 'BCA',
    branch: 'Dago',
    accountNumber: '1234567890',
    accountHolder: 'Bimbel Invoice',
  };
  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const token: unknown = res.body.accessToken;
    if (typeof token !== 'string') throw new Error('Expected token');
    return token;
  }
  const auth = () => ({ Authorization: `Bearer ${operatorToken}` });
  const ownerAuth = () => ({
    Authorization: `Bearer ${ownerToken}`,
    'X-Tenant-Id': tenantId,
  });
  const registrationInput = () => ({
    name: 'Siswa dengan SPP',
    gender: 'female',
    educationLevel: 'SMP Kelas 8',
    school: 'SMP 2',
    address: 'Bandung',
    parentSource: 'new',
    newParent: {
      name: 'Orang Tua SPP',
      phoneNumber: '+6281234567890',
      email: `spp-parent-${randomUUID()}@example.com`,
      password,
    },
  });
  async function detail(id: string): Promise<InvoiceDetailResponseDto> {
    const res = await request(app.getHttpServer())
      .get(`${base}/${id}`)
      .set(auth())
      .expect(200);
    return res.body as InvoiceDetailResponseDto;
  }
  async function issue(
    now = new Date('2020-01-01T01:00:00+07:00'),
  ): Promise<InvoiceDetailResponseDto> {
    await db.manager.update(
      StudentEntity,
      { id: student.id },
      { monthlyFee: 450_000, nextInvoicePeriod: jakartaDate(now).slice(0, 7) },
    );
    const result = await generation.generate(
      tenantId,
      false,
      null,
      undefined,
      now,
    );
    expect(result.created).toBe(1);
    const invoice = await db.manager.findOneByOrFail(InvoiceEntity, {
      tenantId,
      studentId: student.id,
      period: jakartaDate(now).slice(0, 7),
    });
    return detail(invoice.id);
  }
  const paymentBody = (invoice: InvoiceDetailResponseDto) => ({
    requestId: randomUUID(),
    version: invoice.version,
    paidAt: new Date().toISOString(),
    method: 'cash' as const,
    note: 'Diterima admin',
  });

  beforeAll(async () => {
    proofDirectory = await mkdtemp(join(tmpdir(), 'growdu-invoice-e2e-'));
    process.env.INVOICE_PROOF_STORAGE_PATH = proofDirectory;
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
    });
    configureApplication(app);
    await app.init();
    db = app.get(DataSource);
    generation = app.get(InvoiceGenerationService);
    const passwordHash = await app.get(PasswordHashService).hash(password);
    const ownerUser = await db.manager.save(UserEntity, {
      email: 'invoice-owner@example.com',
      passwordHash,
      role: UserRole.Owner,
      tenantId: null,
      status: EntityStatus.Active,
    });
    const owner = await db.manager.save(OwnerEntity, {
      userId: ownerUser.id,
      name: 'Invoice Owner',
      phoneNumber: '081234567890',
      status: EntityStatus.Active,
    });
    tenantId = (
      await db.manager.save(TenantEntity, {
        ownerId: owner.id,
        name: 'Invoice Tenant',
        status: EntityStatus.Active,
      })
    ).id;
    foreignTenantId = (
      await db.manager.save(TenantEntity, {
        ownerId: owner.id,
        name: 'Foreign Invoice Tenant',
        status: EntityStatus.Active,
      })
    ).id;
    ownerToken = await login(ownerUser.email);
    for (const [label, permissions] of [
      ['allowed', [OperatorMenu.Invoices, OperatorMenu.Students]],
      ['denied', []],
      ['invoice-only', [OperatorMenu.Invoices]],
    ] as const) {
      const user = await db.manager.save(UserEntity, {
        tenantId,
        email: `invoice-${label}@example.com`,
        passwordHash,
        role: UserRole.Operator,
        status: EntityStatus.Active,
      });
      await db.manager.save(OperatorEntity, {
        tenantId,
        userId: user.id,
        name: 'Invoice Operator',
        phoneNumber: '081234567890',
        status: EntityStatus.Active,
        menuPermissions: [...permissions],
      });
      const token = await login(user.email);
      if (label === 'allowed') operatorToken = token;
      else if (label === 'denied') deniedToken = token;
      else invoiceOnlyToken = token;
    }
  });
  beforeEach(async () => {
    for (const entity of [
      InvoiceEventEntity,
      InvoicePaymentEntity,
      InvoiceItemEntity,
      InvoiceEntity,
    ])
      await db.getRepository(entity).delete({ tenantId });
    await db.manager.delete(InvoiceSettingsEntity, { tenantId });
    await db.manager.delete(StudentEntity, { tenantId });
    student = await db.manager.save(StudentEntity, {
      tenantId,
      studentCode: `STD-${randomUUID().slice(0, 8)}`,
      name: 'Nadia Putri',
      gender: StudentGender.Female,
      educationLevel: 'SMA Kelas 12',
      school: 'SMA 3',
      address: 'Bandung',
      status: EntityStatus.Active,
      administrativeStatus: EntityStatus.Active,
      billingBlocked: false,
      monthlyFee: null,
      nextInvoicePeriod: null,
    });
  });
  afterAll(async () => {
    await app?.close();
    if (proofDirectory)
      await rm(proofDirectory, { recursive: true, force: true });
  });

  it('requires auth, tenant selection, correct roles and invoice permission', async () => {
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer())
      .get(base)
      .auth(ownerToken, { type: 'bearer' })
      .expect(403);
    for (const path of [
      base,
      `${base}/summary`,
      `${base}/settings`,
      `${base}/options`,
      `${base}/student-options`,
      `${base}/students/${student.id}/billing-profile`,
    ])
      await request(app.getHttpServer())
        .get(path)
        .auth(deniedToken, { type: 'bearer' })
        .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/generations`)
      .auth(deniedToken, { type: 'bearer' })
      .send({})
      .expect(403);
  });
  it('saves registration SPP with the parent and starts automatic billing next month', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/students/registrations')
      .set(ownerAuth())
      .send({ ...registrationInput(), monthlyFee: 450_000 })
      .expect(201);
    const id = created.body.student.id as string;
    const profile = await request(app.getHttpServer())
      .get(`${base}/students/${id}/billing-profile`)
      .set(ownerAuth())
      .expect(200);
    expect(profile.body).toMatchObject({
      studentId: id,
      monthlyFee: 450_000,
      nextInvoicePeriod: nextBillingPeriod(),
    });
    const parents = await request(app.getHttpServer())
      .get(`/api/v1/students/${id}/parents`)
      .set(ownerAuth())
      .expect(200);
    expect(parents.body[0].parentId).toBe(created.body.parentId);
    expect((await generation.generate(tenantId, false)).created).toBe(0);

    for (const optionalFee of [{}, { monthlyFee: null }]) {
      const withoutFee = await request(app.getHttpServer())
        .post('/api/v1/students/registrations')
        .set(ownerAuth())
        .send({
          name: 'Siswa tanpa tarif',
          gender: 'male',
          educationLevel: 'SD Kelas 6',
          school: 'SD 1',
          address: 'Bandung',
          parentSource: 'existing',
          parentId: created.body.parentId,
          ...optionalFee,
        })
        .expect(201);
      expect(
        await db.manager.findOneByOrFail(StudentEntity, {
          id: withoutFee.body.student.id as string,
        }),
      ).toMatchObject({
        monthlyFee: null,
        nextInvoicePeriod: null,
        status: 'active',
      });
    }
  });

  it('rejects invalid registration fees before saving and keeps existing authorization boundaries', async () => {
    for (const monthlyFee of [0, -1, 1.5, 1_000_000_001, 'invalid']) {
      await request(app.getHttpServer())
        .post('/api/v1/students/registrations')
        .set(ownerAuth())
        .send({ ...registrationInput(), monthlyFee })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/api/v1/students/${student.id}/registration`)
        .set(ownerAuth())
        .send({
          monthlyFee,
          parent: {
            name: 'Parent',
            phoneNumber: '081234567890',
            email: 'parent@example.com',
          },
        })
        .expect(400);
    }
    expect(await db.manager.count(StudentEntity, { where: { tenantId } })).toBe(
      1,
    );
    await request(app.getHttpServer())
      .post('/api/v1/students/registrations')
      .set(auth())
      .send({ ...registrationInput(), monthlyFee: 450_000 })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${student.id}/registration`)
      .set(auth())
      .send({
        monthlyFee: 450_000,
        parent: {
          name: 'Parent',
          phoneNumber: '081234567890',
          email: 'parent@example.com',
        },
      })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${student.id}`)
      .set(auth())
      .send({ monthlyFee: 450_000 })
      .expect(400);
  });

  it('updates, preserves and clears registration SPP without changing issued invoices or unpaid suspension', async () => {
    const input = registrationInput();
    const created = await request(app.getHttpServer())
      .post('/api/v1/students/registrations')
      .set(ownerAuth())
      .send({ ...input, monthlyFee: 450_000 })
      .expect(201);
    const id = created.body.student.id as string;
    const { password: _password, ...parent } = input.newParent;
    await db.manager.update(
      StudentEntity,
      { id },
      { nextInvoicePeriod: '2020-01' },
    );
    expect(
      (
        await generation.generate(
          tenantId,
          false,
          null,
          undefined,
          new Date('2020-01-01T01:00:00+07:00'),
        )
      ).created,
    ).toBe(1);
    const invoice = await db.manager.findOneByOrFail(InvoiceEntity, {
      studentId: id,
    });
    await generation.reconcile(tenantId);
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${id}/registration`)
      .set(ownerAuth())
      .send({ monthlyFee: 550_000, parent })
      .expect(200);
    const updated = await db.manager.findOneByOrFail(StudentEntity, { id });
    expect(updated.monthlyFee).toBe(550_000);
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${id}/registration`)
      .set(ownerAuth())
      .send({ school: 'SMP Baru', parent })
      .expect(200);
    expect(
      await db.manager.findOneByOrFail(StudentEntity, { id }),
    ).toMatchObject({
      monthlyFee: 550_000,
      nextInvoicePeriod: updated.nextInvoicePeriod,
      school: 'SMP Baru',
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${id}/registration`)
      .set(ownerAuth())
      .send({ monthlyFee: null, parent })
      .expect(200);
    expect(
      await db.manager.findOneByOrFail(StudentEntity, { id }),
    ).toMatchObject({
      monthlyFee: null,
      nextInvoicePeriod: null,
      billingBlocked: true,
      status: 'inactive',
    });
    expect(await detail(invoice.id)).toMatchObject({
      total: 450_000,
      status: 'overdue',
      studentStatus: 'inactive',
    });
  });

  it('rolls back SPP and student changes on parent conflicts and rejects foreign-tenant registration updates', async () => {
    const input = registrationInput();
    const created = await request(app.getHttpServer())
      .post('/api/v1/students/registrations')
      .set(ownerAuth())
      .send({ ...input, monthlyFee: 450_000 })
      .expect(201);
    const id = created.body.student.id as string;
    const parent = {
      name: 'Changed Parent',
      phoneNumber: '+6281234567890',
      email: 'invoice-owner@example.com',
    };
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${id}/registration`)
      .set(ownerAuth())
      .send({ name: 'Changed Student', monthlyFee: 550_000, parent })
      .expect(409);
    expect(
      await db.manager.findOneByOrFail(StudentEntity, { id }),
    ).toMatchObject({
      name: input.name,
      monthlyFee: 450_000,
      nextInvoicePeriod: nextBillingPeriod(),
    });
    const parents = await request(app.getHttpServer())
      .get(`/api/v1/students/${id}/parents`)
      .set(ownerAuth())
      .expect(200);
    expect(parents.body[0]).toMatchObject({
      parentName: input.newParent.name,
      parentContactEmail: input.newParent.email,
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${id}/registration`)
      .set(ownerAuth())
      .set('X-Tenant-Id', foreignTenantId)
      .send({ monthlyFee: 550_000, parent })
      .expect(404);
  });

  it('defaults to due day 1 and zero grace and validates settings', async () => {
    const defaults = await request(app.getHttpServer())
      .get(`${base}/settings`)
      .set(auth())
      .expect(200);
    expect(defaults.body).toMatchObject({
      dueDay: 1,
      graceDays: 0,
      bankAccount: null,
    });
    await request(app.getHttpServer())
      .patch(`${base}/settings`)
      .set(auth())
      .send({ dueDay: 1, graceDays: 0 })
      .expect(200);
    for (const body of [
      { dueDay: 0, graceDays: 0 },
      { dueDay: 32, graceDays: 0 },
      { dueDay: 1, graceDays: -1 },
      { dueDay: 1, graceDays: 0, tenantId: foreignTenantId },
    ])
      await request(app.getHttpServer())
        .patch(`${base}/settings`)
        .set(auth())
        .send(body)
        .expect(400);
  });
  it('starts a newly configured student next month without issuing or deactivating them', async () => {
    const res = await request(app.getHttpServer())
      .patch(`${base}/students/${student.id}/billing-profile`)
      .set(auth())
      .send({ monthlyFee: 450_000 })
      .expect(200);
    expect(res.body.nextInvoicePeriod).toBe(nextBillingPeriod());
    expect((await generation.generate(tenantId, false)).created).toBe(0);
    expect(
      (await db.manager.findOneByOrFail(StudentEntity, { id: student.id }))
        .status,
    ).toBe('active');
    await request(app.getHttpServer())
      .patch(`${base}/students/${student.id}/billing-profile`)
      .set(auth())
      .send({ monthlyFee: 0 })
      .expect(400);
  });
  it('generates manually once, reports missing tariffs, and prevents duplicates under concurrent generation', async () => {
    const skipped = await request(app.getHttpServer())
      .post(`${base}/generations`)
      .set(auth())
      .send({})
      .expect(201);
    expect(skipped.body.skippedMissingFee).toBe(1);
    await db.manager.update(
      StudentEntity,
      { id: student.id },
      { monthlyFee: 450_000, nextInvoicePeriod: nextBillingPeriod() },
    );
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`${base}/generations`)
          .set(auth())
          .send({}),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results.reduce((sum, r) => sum + Number(r.body.created), 0)).toBe(1);
    const invoice = await db.manager.findOneByOrFail(InvoiceEntity, {
      tenantId,
      studentId: student.id,
    });
    expect(invoice.dueDate >= jakartaDate()).toBe(true);
    expect(await db.manager.count(InvoiceEntity, { where: { tenantId } })).toBe(
      1,
    );
  });
  it('generates only the selected student and keeps concurrent retries duplicate-free', async () => {
    await db.manager.update(
      StudentEntity,
      { id: student.id },
      { monthlyFee: 450_000 },
    );
    const other = await db.manager.save(StudentEntity, {
      ...student,
      id: randomUUID(),
      studentCode: 'INDIVIDUAL-OTHER',
      name: 'Raka Pratama',
      monthlyFee: 350_000,
    });
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`${base}/generations`)
          .set(auth())
          .send({ studentId: student.id, dueDate: jakartaDate() }),
      ),
    );
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(
      results.reduce((sum, result) => sum + Number(result.body.created), 0),
    ).toBe(1);
    expect(
      results.reduce(
        (sum, result) => sum + Number(result.body.skippedExisting),
        0,
      ),
    ).toBe(1);
    expect(await db.manager.count(InvoiceEntity, { where: { tenantId } })).toBe(
      1,
    );
    expect(
      await db.manager.findOneByOrFail(InvoiceEntity, {
        tenantId,
        studentId: student.id,
      }),
    ).toMatchObject({ total: 450_000 });
    expect(
      await db.manager.count(InvoiceEntity, {
        where: { tenantId, studentId: other.id },
      }),
    ).toBe(0);
    expect(
      (await db.manager.findOneByOrFail(StudentEntity, { id: other.id }))
        .nextInvoicePeriod,
    ).toBeNull();
  });

  it('does not reconcile or change another student when generating an individual invoice', async () => {
    await issue();
    const selected = await db.manager.save(StudentEntity, {
      ...student,
      id: randomUUID(),
      studentCode: 'SCOPED-TARGET',
      name: 'Raka Pratama',
      monthlyFee: 350_000,
    });
    await request(app.getHttpServer())
      .post(`${base}/generations`)
      .set(auth())
      .send({ studentId: selected.id })
      .expect(201);
    expect(
      await db.manager.findOneByOrFail(StudentEntity, { id: student.id }),
    ).toMatchObject({ status: 'active', billingBlocked: false });
    expect(
      await db.manager.count(InvoiceEntity, {
        where: { tenantId, studentId: student.id },
      }),
    ).toBe(1);
  });

  it('rejects invalid, foreign, inactive and unpriced targets without falling back to bulk generation', async () => {
    await db.manager.save(StudentEntity, {
      ...student,
      id: randomUUID(),
      studentCode: 'ELIGIBLE-OTHER',
      monthlyFee: 350_000,
    });
    for (const studentId of [null, '', [], 'not-a-uuid']) {
      await request(app.getHttpServer())
        .post(`${base}/generations`)
        .set(auth())
        .send({ studentId })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post(`${base}/generations`)
      .set(auth())
      .send({ studentId: student.id })
      .expect(400);
    await db.manager.update(
      StudentEntity,
      { id: student.id },
      {
        status: EntityStatus.Inactive,
        administrativeStatus: EntityStatus.Inactive,
        monthlyFee: 450_000,
      },
    );
    await request(app.getHttpServer())
      .post(`${base}/generations`)
      .set(auth())
      .send({ studentId: student.id })
      .expect(400);
    const foreign = await db.manager.save(StudentEntity, {
      ...student,
      id: randomUUID(),
      tenantId: foreignTenantId,
      studentCode: 'FOREIGN-TARGET',
      monthlyFee: 450_000,
    });
    for (const studentId of [foreign.id, randomUUID()]) {
      await request(app.getHttpServer())
        .post(`${base}/generations`)
        .set(auth())
        .send({ studentId })
        .expect(404);
    }
    expect(await db.manager.count(InvoiceEntity, { where: { tenantId } })).toBe(
      0,
    );
  });

  it('searches and paginates active student options using invoice permission alone', async () => {
    const target = await db.manager.save(StudentEntity, {
      ...student,
      id: randomUUID(),
      studentCode: 'LOOKUP-100',
      name: 'Alya 100%',
      monthlyFee: 350_000,
    });
    await db.manager.save(StudentEntity, {
      ...student,
      id: randomUUID(),
      studentCode: 'LOOKUP-INACTIVE',
      name: 'Alya Inactive',
      status: EntityStatus.Inactive,
      administrativeStatus: EntityStatus.Inactive,
    });
    const headers = { Authorization: `Bearer ${invoiceOnlyToken}` };
    const page = await request(app.getHttpServer())
      .get(`${base}/student-options`)
      .set(headers)
      .query({ limit: 1 })
      .expect(200);
    expect(page.body).toMatchObject({
      data: [{ id: target.id, studentCode: 'LOOKUP-100', monthlyFee: 350_000 }],
      meta: { page: 1, limit: 1, total: 2, totalPages: 2 },
    });
    const literal = await request(app.getHttpServer())
      .get(`${base}/student-options`)
      .set(headers)
      .query({ search: '%' })
      .expect(200);
    expect(literal.body.data).toHaveLength(1);
    expect(literal.body.data[0].id).toBe(target.id);
    const byCode = await request(app.getHttpServer())
      .get(`${base}/student-options`)
      .set(headers)
      .query({ search: student.studentCode })
      .expect(200);
    expect(byCode.body.data).toMatchObject([
      { id: student.id, monthlyFee: null },
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/students')
      .set(headers)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/generations`)
      .set(headers)
      .send({ studentId: target.id })
      .expect(201);
  });

  it('reconciles exact WIB midnight with zero grace', async () => {
    const invoice = await issue();
    expect(invoice.dueDate).toBe('2020-01-01');
    expect(invoice.suspensionDate).toBe('2020-01-02');
    await generation.reconcile(
      tenantId,
      new Date('2020-01-01T23:59:59.999+07:00'),
    );
    expect(
      (await db.manager.findOneByOrFail(StudentEntity, { id: student.id }))
        .status,
    ).toBe('active');
    await generation.reconcile(tenantId, new Date('2020-01-02T00:00:00+07:00'));
    expect(
      await db.manager.findOneByOrFail(StudentEntity, { id: student.id }),
    ).toMatchObject({
      status: 'inactive',
      administrativeStatus: 'active',
      billingBlocked: true,
    });
    expect(
      (
        await generation.generate(
          tenantId,
          false,
          null,
          undefined,
          new Date('2020-02-01T00:00:00+07:00'),
        )
      ).created,
    ).toBe(0);
  });
  it('retains invoice settings and identity snapshots after configuration changes', async () => {
    const invoice = await issue();
    await request(app.getHttpServer())
      .patch(`${base}/settings`)
      .set(auth())
      .send({ dueDay: 10, graceDays: 7 })
      .expect(200);
    await db.manager.update(
      StudentEntity,
      { id: student.id },
      { name: 'Changed Name', monthlyFee: 900_000 },
    );
    const unchanged = await detail(invoice.id);
    expect(unchanged).toMatchObject({
      studentName: 'Nadia Putri',
      dueDate: '2020-01-01',
      suspensionDate: '2020-01-02',
      total: 450_000,
    });
  });
  it('edits adjustments, rejects stale versions and invalid totals, and audits the change', async () => {
    const invoice = await issue();
    const items = [
      {
        kind: 'tuition',
        description: 'SPP Januari',
        quantity: 1,
        unitAmount: 450_000,
      },
      {
        kind: 'discount',
        description: 'Diskon',
        quantity: 1,
        unitAmount: 50_000,
      },
    ];
    const updated = await request(app.getHttpServer())
      .patch(`${base}/${invoice.id}/items`)
      .set(auth())
      .send({ version: 1, items })
      .expect(200);
    expect(updated.body.total).toBe(400_000);
    expect(
      updated.body.events.some(
        (e: { type: string }) => e.type === 'items_updated',
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .patch(`${base}/${invoice.id}/items`)
      .set(auth())
      .send({ version: 1, items })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`${base}/${invoice.id}/items`)
      .set(auth())
      .send({
        version: 2,
        items: [items[0], { ...items[1], unitAmount: 450_000 }],
      })
      .expect(400);
    expect((await detail(invoice.id)).total).toBe(400_000);
  });
  it('settles atomically, reactivates the student, and retries idempotently without another payment', async () => {
    const invoice = await issue();
    await generation.reconcile(tenantId);
    const body = paymentBody(invoice);
    const paid = await request(app.getHttpServer())
      .post(`${base}/${invoice.id}/payments`)
      .set(auth())
      .send(body)
      .expect(201);
    expect(paid.body).toMatchObject({
      status: 'paid',
      billingBlocked: false,
      studentStatus: 'active',
      total: 450_000,
    });
    await request(app.getHttpServer())
      .post(`${base}/${invoice.id}/payments`)
      .set(auth())
      .send(body)
      .expect(201);
    expect(
      await db.manager.count(InvoicePaymentEntity, {
        where: { tenantId, invoiceId: invoice.id },
      }),
    ).toBe(1);
    expect(
      (await db.manager.findOneByOrFail(StudentEntity, { id: student.id }))
        .nextInvoicePeriod,
    ).toBe(nextBillingPeriod());
    expect((await generation.generate(tenantId, false)).created).toBe(0);
    await request(app.getHttpServer())
      .patch(`${base}/${invoice.id}/items`)
      .set(auth())
      .send({
        version: 2,
        items: [
          { kind: 'tuition', description: 'SPP', quantity: 1, unitAmount: 1 },
        ],
      })
      .expect(409);
  });
  it('keeps the student blocked when another overdue invoice is still unpaid', async () => {
    const first = await issue();
    const source = await db.manager.findOneByOrFail(InvoiceEntity, {
      id: first.id,
    });
    await db.manager.save(InvoiceEntity, {
      ...source,
      id: randomUUID(),
      number: 'INV-202002-SECOND',
      period: '2020-02',
      dueDate: '2020-02-01',
      suspensionDate: '2020-02-02',
    });
    const paid = await request(app.getHttpServer())
      .post(`${base}/${first.id}/payments`)
      .set(auth())
      .send(paymentBody(first))
      .expect(201);
    expect(paid.body).toMatchObject({
      status: 'paid',
      studentStatus: 'inactive',
      billingBlocked: true,
    });
  });
  it('does not reactivate a manually inactive student or allow the students API to bypass billing', async () => {
    const invoice = await issue();
    await generation.reconcile(tenantId);
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${student.id}`)
      .set(auth())
      .send({ status: 'active' })
      .expect(200);
    expect(
      (await db.manager.findOneByOrFail(StudentEntity, { id: student.id }))
        .status,
    ).toBe('inactive');
    await request(app.getHttpServer())
      .patch(`/api/v1/students/${student.id}`)
      .set(auth())
      .send({ status: 'inactive' })
      .expect(200);
    const paid = await request(app.getHttpServer())
      .post(`${base}/${invoice.id}/payments`)
      .set(auth())
      .send(paymentBody(invoice))
      .expect(201);
    expect(paid.body).toMatchObject({
      status: 'paid',
      studentStatus: 'inactive',
      billingBlocked: false,
    });
  });
  it('allows only one of two simultaneous distinct payments', async () => {
    const invoice = await issue();
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`${base}/${invoice.id}/payments`)
          .set(auth())
          .send(paymentBody(invoice)),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.manager.count(InvoicePaymentEntity, { where: { tenantId } }),
    ).toBe(1);
  });
  it('rolls back invalid proof uploads without changing payment or status', async () => {
    const invoice = await issue(),
      body = paymentBody(invoice);
    const req = request(app.getHttpServer())
      .post(`${base}/${invoice.id}/payments`)
      .set(auth());
    for (const [key, value] of Object.entries(body))
      req.field(key, String(value));
    await req
      .attach('file', Buffer.from('invalid image'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect((await detail(invoice.id)).status).toBe('overdue');
    expect(
      await db.manager.count(InvoicePaymentEntity, { where: { tenantId } }),
    ).toBe(0);
  });
  it('keeps uploaded proof private and preserves it after audited reversal', async () => {
    const invoice = await issue(),
      body = paymentBody(invoice);
    const req = request(app.getHttpServer())
      .post(`${base}/${invoice.id}/payments`)
      .set(auth());
    for (const [key, value] of Object.entries(body))
      req.field(key, String(value));
    const paid = await req
      .attach('file', png, { filename: 'bukti.png', contentType: 'image/png' })
      .expect(201);
    const p = paid.body.payments[0] as { id: string; proofName: string };
    expect(p.proofName).toBe('bukti.png');
    expect(p).not.toHaveProperty('proofKey');
    expect(p).not.toHaveProperty('requestHash');
    const url = `${base}/${invoice.id}/payments/${p.id}/proof`;
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer())
      .get(url)
      .set(auth())
      .expect('Content-Type', /image\/png/)
      .expect(200);
    await request(app.getHttpServer())
      .post(`${base}/${invoice.id}/payments/${p.id}/reversals`)
      .set(auth())
      .send({ version: 2, reason: 'Salah pencatatan pembayaran' })
      .expect(201);
    const reversed = await detail(invoice.id);
    expect(reversed).toMatchObject({
      status: 'overdue',
      studentStatus: 'inactive',
      billingBlocked: true,
    });
    expect(reversed.payments[0].reversedAt).not.toBeNull();
    await request(app.getHttpServer()).get(url).set(auth()).expect(200);
  });
  it('limits bank changes to the owner and provides a real PDF download', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/tenants/me/invoice-payment-account')
      .set(auth())
      .send({ bankAccount: bank })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/v1/tenants/me/invoice-payment-account')
      .auth(ownerToken, { type: 'bearer' })
      .set('X-Tenant-Id', tenantId)
      .send({ bankAccount: bank })
      .expect(200);
    const invoice = await issue();
    expect(invoice.snapshot.bankAccount).toMatchObject(bank);
    await request(app.getHttpServer())
      .get(`${base}/${invoice.id}/pdf`)
      .set(auth())
      .expect('Content-Type', /application\/pdf/)
      .expect('Content-Disposition', /attachment/)
      .expect(200);
  });
  it('isolates tenant details, lists, mutations, proof and billing profiles', async () => {
    const invoice = await issue();
    for (const suffix of [
      `/${invoice.id}`,
      `/${invoice.id}/pdf`,
      `/students/${student.id}/billing-profile`,
    ])
      await request(app.getHttpServer())
        .get(base + suffix)
        .auth(ownerToken, { type: 'bearer' })
        .set('X-Tenant-Id', foreignTenantId)
        .expect(404);
    await request(app.getHttpServer())
      .patch(`${base}/${invoice.id}/items`)
      .auth(ownerToken, { type: 'bearer' })
      .set('X-Tenant-Id', foreignTenantId)
      .send({
        version: 1,
        items: [
          {
            kind: 'tuition',
            description: 'SPP',
            quantity: 1,
            unitAmount: 450_000,
          },
        ],
      })
      .expect(404);
    const list = await request(app.getHttpServer())
      .get(base)
      .auth(ownerToken, { type: 'bearer' })
      .set('X-Tenant-Id', foreignTenantId)
      .expect(200);
    expect(list.body.meta.total).toBe(0);
    const summary = await request(app.getHttpServer())
      .get(`${base}/summary`)
      .set(auth())
      .expect(200);
    expect(summary.body).toMatchObject({
      total: 1,
      totalAmount: 450_000,
      unpaid: 0,
      overdue: 1,
      pending: 1,
    });
    await request(app.getHttpServer())
      .get(`${base}/${invoice.id}`)
      .set(auth())
      .set('X-Tenant-Id', foreignTenantId)
      .expect(403);
  });
});
