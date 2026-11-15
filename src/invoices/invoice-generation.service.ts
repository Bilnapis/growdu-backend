import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import {
  billingDueDate,
  jakartaDate,
  nextBillingPeriod,
  shiftCalendarDate,
} from '../common/jakarta-date.js';
import { StudentEntity } from '../students/entities/student.entity.js';
import {
  InvoiceEntity,
  InvoiceItemEntity,
  InvoiceSequenceEntity,
} from './entities/invoice.entity.js';
import { InvoiceStore } from './invoice-store.service.js';
import type { InvoiceGenerationResponseDto } from './dto/invoice-response.dto.js';

@Injectable()
export class InvoiceGenerationService {
  constructor(private readonly store: InvoiceStore) {}

  async reconcile(
    tenantId?: string,
    now = new Date(),
    studentId?: string,
  ): Promise<void> {
    const qb = this.store.db
      .getRepository(StudentEntity)
      .createQueryBuilder('s')
      .select(['s.id', 's.tenantId'])
      .where(
        '(s.billing_blocked=1 OR EXISTS (SELECT 1 FROM invoices i WHERE i.tenant_id=s.tenant_id AND i.student_id=s.id AND i.paid_at IS NULL AND i.suspension_date<=:today))',
        { today: jakartaDate(now) },
      );
    if (tenantId) qb.andWhere('s.tenant_id=:tenantId', { tenantId });
    if (studentId) qb.andWhere('s.id=:studentId', { studentId });
    const students = await qb.orderBy('s.id', 'ASC').getMany();
    for (const candidate of students) {
      await this.store.db.transaction(async (m) => {
        const student = await this.store.student(
          m,
          candidate.tenantId,
          candidate.id,
        );
        await this.store.syncStudent(m, student, now);
      });
    }
  }

  generate(
    tenantId: string,
    manual: boolean,
    actorId: string | null = null,
    requestedDueDate?: string,
    now = new Date(),
  ): Promise<InvoiceGenerationResponseDto> {
    return this.generateScope(tenantId, manual, actorId, requestedDueDate, now);
  }

  generateForStudent(
    tenantId: string,
    actorId: string,
    studentId: string,
    requestedDueDate?: string,
    now = new Date(),
  ): Promise<InvoiceGenerationResponseDto> {
    return this.generateScope(
      tenantId,
      true,
      actorId,
      requestedDueDate,
      now,
      studentId,
    );
  }

  private async generateScope(
    tenantId: string,
    manual: boolean,
    actorId: string | null,
    requestedDueDate: string | undefined,
    now: Date,
    studentId?: string,
  ): Promise<InvoiceGenerationResponseDto> {
    const today = jakartaDate(now),
      period = today.slice(0, 7);
    if (requestedDueDate && requestedDueDate < today)
      throw new BadRequestException(
        'Jatuh tempo manual tidak boleh sebelum hari ini.',
      );
    if (studentId) {
      const exists = await this.store.db.manager.existsBy(StudentEntity, {
        tenantId,
        id: studentId,
      });
      if (!exists) throw new NotFoundException('Siswa tidak ditemukan.');
    }
    await this.reconcile(tenantId, now, studentId);
    const candidates = await this.store.db.manager.find(StudentEntity, {
      where: {
        tenantId,
        status: EntityStatus.Active,
        ...(studentId ? { id: studentId } : {}),
      },
      select: { id: true },
      order: { id: 'ASC' },
    });
    if (studentId && candidates.length === 0)
      throw new BadRequestException(
        'Invoice hanya dapat dibuat untuk siswa aktif.',
      );
    const result: InvoiceGenerationResponseDto = {
      created: 0,
      skippedExisting: 0,
      skippedMissingFee: 0,
      period,
    };
    for (const candidate of candidates) {
      const outcome = await this.store.db.transaction(async (m) => {
        const student = await this.store.student(m, tenantId, candidate.id);
        // Re-evaluate under the same student lock used by payment and manual deactivation.
        await this.store.syncStudent(m, student, now);
        if (student.status !== EntityStatus.Active) {
          if (studentId)
            throw new BadRequestException(
              'Invoice hanya dapat dibuat untuk siswa aktif.',
            );
          return 'ineligible';
        }
        if (student.monthlyFee === null) {
          if (studentId)
            throw new BadRequestException(
              'Atur tarif SPP siswa sebelum membuat invoice.',
            );
          return 'missing';
        }
        if (
          !manual &&
          (!student.nextInvoicePeriod || student.nextInvoicePeriod > period)
        )
          return 'ineligible';
        const existing = await m.findOneBy(InvoiceEntity, {
          tenantId,
          studentId: student.id,
          period,
        });
        if (existing) {
          student.nextInvoicePeriod = nextBillingPeriod(now);
          await m.save(student);
          return 'existing';
        }
        const settings = await this.store.settings(tenantId, m);
        const configuredDue = billingDueDate(period, settings.dueDay);
        const dueDate = manual
          ? (requestedDueDate ??
            (configuredDue > today ? configuredDue : today))
          : configuredDue;
        await m
          .createQueryBuilder()
          .insert()
          .into(InvoiceSequenceEntity)
          .values({ tenantId, period, value: 0 })
          .orIgnore()
          .execute();
        const sequence = await m.findOneOrFail(InvoiceSequenceEntity, {
          where: { tenantId, period },
          lock: { mode: 'pessimistic_write' },
        });
        sequence.value += 1;
        await m.save(sequence);
        const invoice = await m.save(
          InvoiceEntity,
          m.create(InvoiceEntity, {
            tenantId,
            studentId: student.id,
            number: `INV-${period.replace('-', '')}-${String(sequence.value).padStart(3, '0')}`,
            period,
            issuedDate: today,
            dueDate,
            graceDays: settings.graceDays,
            suspensionDate: shiftCalendarDate(dueDate, settings.graceDays + 1),
            studentName: student.name,
            snapshot: await this.store.snapshot(m, student, settings, today),
            total: student.monthlyFee,
            paidAt: null,
            version: 1,
          }),
        );
        await m.save(
          InvoiceItemEntity,
          m.create(InvoiceItemEntity, {
            tenantId,
            invoiceId: invoice.id,
            kind: 'tuition',
            description: `SPP ${period}`,
            quantity: 1,
            unitAmount: student.monthlyFee,
            sortOrder: 0,
          }),
        );
        student.nextInvoicePeriod = nextBillingPeriod(now);
        await m.save(student);
        await this.store.event(m, invoice, 'issued', actorId, {
          automatic: !manual,
          total: invoice.total,
          dueDate,
          graceDays: settings.graceDays,
        });
        // A late recovery run can create an already-overdue current-month invoice.
        await this.store.syncStudent(m, student, now, actorId, invoice);
        return 'created';
      });
      if (outcome === 'created') result.created += 1;
      if (outcome === 'existing') result.skippedExisting += 1;
      if (outcome === 'missing') result.skippedMissingFee += 1;
    }
    return result;
  }
}
