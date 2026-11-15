import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull, LessThanOrEqual } from 'typeorm';
import { jakartaDate } from '../common/jakarta-date.js';
import { StudentEntity } from '../students/entities/student.entity.js';
import { StudentParentEntity } from '../students/entities/student-parent.entity.js';
import { refreshStudentStatus } from '../students/student-status.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import {
  InvoiceEntity,
  InvoiceEventEntity,
  InvoiceItemEntity,
  InvoicePaymentEntity,
  InvoiceSettingsEntity,
  type InvoiceSnapshot,
} from './entities/invoice.entity.js';
import { invoiceStatus } from './invoice-rules.js';
import type {
  InvoiceDetailResponseDto,
  InvoiceListResponseDto,
} from './dto/invoice-response.dto.js';

@Injectable()
export class InvoiceStore {
  constructor(readonly db: DataSource) {}

  async settings(
    tenantId: string,
    manager = this.db.manager,
  ): Promise<InvoiceSettingsEntity> {
    // Atomic insert makes first-time settings safe across concurrent requests/workers.
    await manager
      .createQueryBuilder()
      .insert()
      .into(InvoiceSettingsEntity)
      .values({ tenantId, dueDay: 1, graceDays: 0, bankAccount: null })
      .orIgnore()
      .execute();
    return manager.findOneByOrFail(InvoiceSettingsEntity, { tenantId });
  }

  async student(
    manager: EntityManager,
    tenantId: string,
    id: string,
  ): Promise<StudentEntity> {
    const student = await manager.findOne(StudentEntity, {
      where: { tenantId, id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan.');
    return student;
  }

  async invoice(
    tenantId: string,
    id: string,
    manager = this.db.manager,
  ): Promise<InvoiceEntity> {
    const invoice = await manager.findOneBy(InvoiceEntity, { id, tenantId });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    return invoice;
  }

  async lockInvoice(manager: EntityManager, tenantId: string, id: string) {
    const initial = await this.invoice(tenantId, id, manager);
    // Every invoice write locks student before invoice, including generation/reconciliation.
    const student = await this.student(manager, tenantId, initial.studentId);
    const invoice = await manager.findOne(InvoiceEntity, {
      where: { id, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    return { student, invoice };
  }

  async event(
    manager: EntityManager,
    invoice: InvoiceEntity,
    type: string,
    actorId: string | null,
    details: Record<string, unknown> = {},
  ) {
    await manager.save(
      InvoiceEventEntity,
      manager.create(InvoiceEventEntity, {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        type,
        actorId,
        details,
      }),
    );
  }

  async syncStudent(
    manager: EntityManager,
    student: StudentEntity,
    now = new Date(),
    actorId: string | null = null,
    cause?: InvoiceEntity,
  ) {
    const blocking = await manager.findOne(InvoiceEntity, {
      where: {
        tenantId: student.tenantId,
        studentId: student.id,
        paidAt: IsNull(),
        suspensionDate: LessThanOrEqual(jakartaDate(now)),
      },
      order: { suspensionDate: 'ASC' },
    });
    const previous = student.status;
    const previousBlocked = student.billingBlocked;
    student.billingBlocked = Boolean(blocking);
    refreshStudentStatus(student, now);
    if (
      previous !== student.status ||
      previousBlocked !== student.billingBlocked
    ) {
      await manager.save(student);
      const invoice =
        cause ??
        blocking ??
        (await manager.findOne(InvoiceEntity, {
          where: { tenantId: student.tenantId, studentId: student.id },
          order: { createdAt: 'DESC' },
        }));
      if (invoice)
        await this.event(manager, invoice, 'student_status_changed', actorId, {
          previousStatus: previous,
          status: student.status,
          billingBlocked: student.billingBlocked,
        });
    }
  }

  async snapshot(
    manager: EntityManager,
    student: StudentEntity,
    settings: InvoiceSettingsEntity,
    today: string,
  ): Promise<InvoiceSnapshot> {
    const [tenant, relation, groups] = await Promise.all([
      manager.findOneByOrFail(TenantEntity, { id: student.tenantId }),
      manager.findOne(StudentParentEntity, {
        where: {
          tenantId: student.tenantId,
          studentId: student.id,
          isPrimary: true,
        },
        relations: { parent: true },
      }),
      manager
        .createQueryBuilder()
        .select('g.id', 'id')
        .addSelect('g.name', 'name')
        .from('study_groups', 'g')
        .innerJoin(
          'study_group_students',
          'member',
          'member.study_group_id=g.id AND member.tenant_id=g.tenant_id',
        )
        .innerJoin(
          'study_group_configurations',
          'c',
          'c.id=member.configuration_id AND c.tenant_id=g.tenant_id',
        )
        .where(
          'g.tenant_id=:tenantId AND member.student_id=:studentId AND g.status=:status AND c.superseded_at IS NULL AND c.effective_from<=:today AND c.effective_until>=:today',
          {
            tenantId: student.tenantId,
            studentId: student.id,
            status: 'active',
            today,
          },
        )
        .distinct(true)
        .orderBy('g.name', 'ASC')
        .getRawMany<{ id: string; name: string }>(),
    ]);
    return {
      tenantName: tenant.name,
      tenantAddress: tenant.address,
      studentCode: student.studentCode,
      studentName: student.name,
      educationLevel: student.educationLevel,
      school: student.school,
      address: student.address,
      parentName: relation?.parent.name ?? null,
      parentPhone: relation?.parent.phoneNumber ?? null,
      parentEmail: relation?.parent.contactEmail ?? null,
      groups,
      bankAccount: settings.bankAccount,
    };
  }

  listItem(invoice: InvoiceEntity): InvoiceListResponseDto {
    return {
      id: invoice.id,
      studentId: invoice.studentId,
      number: invoice.number,
      period: invoice.period,
      studentName: invoice.studentName,
      groups: invoice.snapshot.groups,
      issuedDate: invoice.issuedDate,
      dueDate: invoice.dueDate,
      suspensionDate: invoice.suspensionDate,
      total: invoice.total,
      status: invoiceStatus(invoice),
      version: invoice.version,
      updatedAt: invoice.updatedAt,
    };
  }

  async detail(
    tenantId: string,
    id: string,
  ): Promise<InvoiceDetailResponseDto> {
    const invoice = await this.invoice(tenantId, id);
    const [items, payments, events, student] = await Promise.all([
      this.db.manager.find(InvoiceItemEntity, {
        where: { tenantId, invoiceId: id },
        order: { sortOrder: 'ASC' },
      }),
      this.db.manager.find(InvoicePaymentEntity, {
        where: { tenantId, invoiceId: id },
        order: { createdAt: 'DESC' },
      }),
      this.db.manager.find(InvoiceEventEntity, {
        where: { tenantId, invoiceId: id },
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
      this.db.manager.findOneByOrFail(StudentEntity, {
        tenantId,
        id: invoice.studentId,
      }),
    ]);
    return {
      ...this.listItem(invoice),
      snapshot: invoice.snapshot,
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        description: item.description,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        subtotal:
          (item.kind === 'discount' ? -1 : 1) * item.quantity * item.unitAmount,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        paidAt: p.paidAt,
        method: p.method,
        reference: p.reference,
        note: p.note,
        recordedByName: p.recordedByName,
        proofName: p.proofName,
        reversedAt: p.reversedAt,
        reversalReason: p.reversalReason,
      })),
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        actorId: e.actorId,
        details: e.details,
        createdAt: e.createdAt,
      })),
      billingBlocked: student.billingBlocked,
      studentStatus: student.status,
    };
  }
}
