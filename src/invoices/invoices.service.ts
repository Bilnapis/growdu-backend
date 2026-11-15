import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createPaginationMeta,
  type PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { jakartaDate } from '../common/jakarta-date.js';
import { setStudentMonthlyFee } from '../students/student-billing.js';
import { StudentEntity } from '../students/entities/student.entity.js';
import {
  InvoiceEntity,
  InvoiceItemEntity,
  InvoiceSettingsEntity,
} from './entities/invoice.entity.js';
import {
  InvoiceQueryDto,
  type UpdateBillingProfileDto,
  type UpdateInvoiceBankAccountDto,
  type UpdateInvoiceItemsDto,
  type UpdateInvoiceSettingsDto,
} from './dto/invoice-input.dto.js';
import type { InvoiceSummaryResponseDto } from './dto/invoice-response.dto.js';
import { InvoiceStore } from './invoice-store.service.js';
import { invoiceTotal } from './invoice-rules.js';

@Injectable()
export class InvoicesService {
  constructor(private readonly store: InvoiceStore) {}

  private query(
    tenantId: string,
    query: InvoiceQueryDto,
    includeStatus = true,
  ) {
    const qb = this.store.db
      .getRepository(InvoiceEntity)
      .createQueryBuilder('invoice')
      .where('invoice.tenant_id=:tenantId', { tenantId });
    if (query.period)
      qb.andWhere('invoice.period=:period', { period: query.period });
    if (query.studentId)
      qb.andWhere('invoice.student_id=:studentId', {
        studentId: query.studentId,
      });
    if (query.groupId)
      qb.andWhere("JSON_CONTAINS(invoice.snapshot, :groupId, '$.groups')", {
        groupId: JSON.stringify({ id: query.groupId }),
      });
    if (query.search)
      qb.andWhere(
        '(invoice.number LIKE :search OR invoice.student_name LIKE :search)',
        { search: `%${query.search.replace(/[\\%_]/g, '\\$&')}%` },
      );
    if (includeStatus && query.status) {
      if (query.status === 'paid') qb.andWhere('invoice.paid_at IS NOT NULL');
      else
        qb.andWhere(
          `invoice.paid_at IS NULL AND invoice.due_date ${query.status === 'overdue' ? '<' : '>='} :today`,
          { today: jakartaDate() },
        );
    }
    return qb;
  }

  async list(tenantId: string, query: InvoiceQueryDto) {
    const [items, total] = await this.query(tenantId, query)
      .orderBy('invoice.period', 'DESC')
      .addOrderBy('invoice.number', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      data: items.map((i) => this.store.listItem(i)),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async summary(
    tenantId: string,
    query: InvoiceQueryDto,
  ): Promise<InvoiceSummaryResponseDto> {
    const raw = await this.query(tenantId, query, false)
      .select('COUNT(*)', 'total')
      .addSelect('COALESCE(SUM(invoice.total),0)', 'totalAmount')
      .addSelect('COALESCE(SUM(invoice.paid_at IS NOT NULL),0)', 'paid')
      .addSelect(
        'COALESCE(SUM(invoice.paid_at IS NULL AND invoice.due_date>=:today),0)',
        'unpaid',
      )
      .addSelect(
        'COALESCE(SUM(invoice.paid_at IS NULL AND invoice.due_date<:today),0)',
        'overdue',
      )
      .setParameter('today', jakartaDate())
      .getRawOne<{
        total: string;
        totalAmount: string;
        paid: string;
        unpaid: string;
        overdue: string;
      }>();
    const unpaid = Number(raw?.unpaid ?? 0),
      overdue = Number(raw?.overdue ?? 0);
    return {
      total: Number(raw?.total ?? 0),
      totalAmount: Number(raw?.totalAmount ?? 0),
      paid: Number(raw?.paid ?? 0),
      unpaid,
      overdue,
      pending: unpaid + overdue,
    };
  }

  detail(tenantId: string, id: string) {
    return this.store.detail(tenantId, id);
  }

  async options(tenantId: string) {
    const groups = await this.store.db.manager
      .createQueryBuilder()
      .select('g.id', 'id')
      .addSelect('g.name', 'name')
      .from('study_groups', 'g')
      .where('g.tenant_id=:tenantId', { tenantId })
      .orderBy('g.name', 'ASC')
      .getRawMany<{ id: string; name: string }>();
    return { groups };
  }

  async studentOptions(tenantId: string, query: PaginationQueryDto) {
    const builder = this.store.db
      .getRepository(StudentEntity)
      .createQueryBuilder('student')
      .select([
        'student.id',
        'student.studentCode',
        'student.name',
        'student.monthlyFee',
      ])
      .where('student.tenant_id=:tenantId AND student.status=:status', {
        tenantId,
        status: EntityStatus.Active,
      });
    if (query.search)
      builder.andWhere(
        '(student.name LIKE :search OR student.student_code LIKE :search)',
        {
          search: `%${query.search.replace(/[\\%_]/g, '\\$&')}%`,
        },
      );
    const [students, total] = await builder
      .orderBy('student.name', 'ASC')
      .addOrderBy('student.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      data: students.map((student) => ({
        id: student.id,
        studentCode: student.studentCode,
        name: student.name,
        monthlyFee: student.monthlyFee,
      })),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async settings(tenantId: string) {
    const s = await this.store.settings(tenantId);
    return {
      dueDay: s.dueDay,
      graceDays: s.graceDays,
      bankAccount: s.bankAccount,
    };
  }

  async updateSettings(tenantId: string, dto: UpdateInvoiceSettingsDto) {
    await this.store.settings(tenantId);
    await this.store.db.manager.update(
      InvoiceSettingsEntity,
      { tenantId },
      { dueDay: dto.dueDay, graceDays: dto.graceDays },
    );
    return this.settings(tenantId);
  }

  async updateBank(tenantId: string, dto: UpdateInvoiceBankAccountDto) {
    if (dto.bankAccount === undefined)
      throw new BadRequestException('Rekening tujuan harus diisi atau null.');
    await this.store.settings(tenantId);
    await this.store.db.manager.update(
      InvoiceSettingsEntity,
      { tenantId },
      { bankAccount: dto.bankAccount },
    );
    return this.settings(tenantId);
  }

  async billingProfile(tenantId: string, studentId: string) {
    const student = await this.store.db.manager.findOneBy(StudentEntity, {
      tenantId,
      id: studentId,
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan.');
    return {
      studentId,
      monthlyFee: student.monthlyFee,
      nextInvoicePeriod: student.nextInvoicePeriod,
    };
  }

  async updateBillingProfile(
    tenantId: string,
    studentId: string,
    dto: UpdateBillingProfileDto,
  ) {
    await this.store.db.transaction(async (m) => {
      const student = await this.store.student(m, tenantId, studentId);
      setStudentMonthlyFee(student, dto.monthlyFee);
      await m.save(student);
    });
    return this.billingProfile(tenantId, studentId);
  }

  async updateItems(
    tenantId: string,
    id: string,
    actorId: string,
    dto: UpdateInvoiceItemsDto,
  ) {
    const total = invoiceTotal(dto.items);
    await this.store.db.transaction(async (m) => {
      const { invoice } = await this.store.lockInvoice(m, tenantId, id);
      if (invoice.paidAt)
        throw new ConflictException(
          'Batalkan pencatatan pelunasan sebelum mengubah rincian.',
        );
      if (invoice.version !== dto.version)
        throw new ConflictException(
          'Invoice berubah. Muat ulang sebelum menyimpan.',
        );
      const previous = await m.find(InvoiceItemEntity, {
        where: { tenantId, invoiceId: id },
        order: { sortOrder: 'ASC' },
      });
      await m.delete(InvoiceItemEntity, { tenantId, invoiceId: id });
      await m.save(
        InvoiceItemEntity,
        dto.items.map((item, sortOrder) =>
          m.create(InvoiceItemEntity, {
            ...item,
            tenantId,
            invoiceId: id,
            sortOrder,
          }),
        ),
      );
      const previousTotal = invoice.total;
      invoice.total = total;
      invoice.version += 1;
      await m.save(invoice);
      await this.store.event(m, invoice, 'items_updated', actorId, {
        previousItems: previous.map(
          ({ kind, description, quantity, unitAmount }) => ({
            kind,
            description,
            quantity,
            unitAmount,
          }),
        ),
        items: dto.items,
        previousTotal,
        total,
      });
    });
    return this.detail(tenantId, id);
  }
}
