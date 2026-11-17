import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { In } from 'typeorm';
import {
  createPaginationMeta,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';
import { jakartaDate } from '../common/jakarta-date.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import {
  PayrollEntity,
  PayrollItemEntity,
  PayrollPaymentEntity,
} from './entities/payroll.entity.js';
import {
  PayrollQueryDto,
  UpdatePayrollItemsDto,
} from './dto/payroll-input.dto.js';
import { moneyMinor, moneyString, payrollTotal } from './payroll-rules.js';
import { PayrollStore } from './payroll-store.service.js';

@Injectable()
export class PayrollService {
  constructor(private readonly store: PayrollStore) {}
  private query(tenantId: string, q: PayrollQueryDto, statuses = true) {
    const qb = this.store.db
      .getRepository(PayrollEntity)
      .createQueryBuilder('p')
      .where('p.tenant_id=:tenantId', { tenantId });
    if (q.month) qb.andWhere('LEFT(p.pay_date,7)=:month', { month: q.month });
    if (q.periodId)
      qb.andWhere('p.period_id=:periodId', { periodId: q.periodId });
    if (q.tutorId) qb.andWhere('p.tutor_id=:tutorId', { tutorId: q.tutorId });
    if (q.search)
      qb.andWhere('(p.number LIKE :search OR p.tutor_name LIKE :search)', {
        search: `%${q.search.replace(/[\\%_]/g, '\\$&')}%`,
      });
    if (statuses && q.status) {
      if (q.status === 'paid') qb.andWhere('p.paid_at IS NOT NULL');
      else
        qb.andWhere(
          `p.paid_at IS NULL AND p.pay_date ${q.status === 'overdue' ? '<' : '>='} :today`,
          { today: jakartaDate() },
        );
    }
    return qb;
  }
  async list(tenantId: string, q: PayrollQueryDto) {
    const [rows, total] = await this.query(tenantId, q)
      .orderBy('p.pay_date', 'DESC')
      .addOrderBy('p.number', 'DESC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    const items = rows.length
      ? await this.store.db.manager.findBy(PayrollItemEntity, {
          tenantId,
          payrollId: In(rows.map((r) => r.id)),
        })
      : [];
    const byPayroll = new Map<string, PayrollItemEntity[]>();
    for (const item of items) {
      const group = byPayroll.get(item.payrollId) ?? [];
      group.push(item);
      byPayroll.set(item.payrollId, group);
    }
    return {
      data: rows.map((row) =>
        this.store.listItem(row, byPayroll.get(row.id) ?? []),
      ),
      meta: createPaginationMeta(q.page, q.limit, total),
    };
  }
  async summary(tenantId: string, q: PayrollQueryDto) {
    const result = await this.query(tenantId, q, false)
      .select('COUNT(*)', 'total')
      .addSelect('COALESCE(SUM(p.total),0)', 'totalAmount')
      .addSelect('COALESCE(SUM(p.paid_at IS NOT NULL),0)', 'paid')
      .addSelect(
        'COALESCE(SUM(p.paid_at IS NULL AND p.pay_date>=:today),0)',
        'unpaid',
      )
      .addSelect(
        'COALESCE(SUM(p.paid_at IS NULL AND p.pay_date<:today),0)',
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
    const paymentMonth = q.month ?? jakartaDate().slice(0, 7);
    const payment = await this.store.db
      .getRepository(PayrollPaymentEntity)
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount),0)', 'amount')
      .where(
        'payment.tenant_id=:tenantId AND payment.reversed_at IS NULL AND LEFT(payment.paid_date,7)=:paymentMonth',
        { tenantId, paymentMonth },
      )
      .getRawOne<{ amount: string }>();
    return {
      total: Number(result?.total ?? 0),
      totalAmount: moneyString(moneyMinor(result?.totalAmount ?? '0')),
      paid: Number(result?.paid ?? 0),
      unpaid: Number(result?.unpaid ?? 0),
      overdue: Number(result?.overdue ?? 0),
      paidAmount: moneyString(moneyMinor(payment?.amount ?? '0')),
    };
  }
  async tutorOptions(tenantId: string, q: PaginationQueryDto) {
    const qb = this.store.db
      .getRepository(TutorEntity)
      .createQueryBuilder('t')
      .select(['t.id', 't.name', 't.sessionRate', 't.status'])
      .where('t.tenant_id=:tenantId', { tenantId });
    if (q.search)
      qb.andWhere('t.name LIKE :search', {
        search: `%${q.search.replace(/[\\%_]/g, '\\$&')}%`,
      });
    const [rows, total] = await qb
      .orderBy('t.name', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return {
      data: rows.map(({ id, name, sessionRate, status }) => ({
        id,
        name,
        sessionRate,
        status,
      })),
      meta: createPaginationMeta(q.page, q.limit, total),
    };
  }
  async updateItems(
    tenantId: string,
    id: string,
    actorId: string,
    dto: UpdatePayrollItemsDto,
  ) {
    await this.store.db.transaction(async (m) => {
      const p = await this.store.lock(m, tenantId, id);
      this.store.checkEditable(p, dto.version);
      const old = await this.store.items(p, m);
      const previousItems = old.map((i) => ({ ...i }));
      const teaching = old.filter((i) => i.kind === 'teaching');
      const requested = new Map(dto.teaching.map((i) => [i.id, i]));
      if (
        requested.size !== teaching.length ||
        requested.size !== dto.teaching.length ||
        teaching.some((i) => !requested.has(i.id))
      )
        throw new BadRequestException(
          'Rincian harus memuat setiap kelompok belajar tepat satu kali.',
        );
      for (const item of teaching) {
        const input = requested.get(item.id);
        if (!input)
          throw new BadRequestException('Kelompok belajar tidak ditemukan.');
        item.sessionAdjustment = input.quantity - item.sourceCount;
        item.correctionReason = item.sessionAdjustment
          ? input.correctionReason?.trim() || null
          : null;
        if (
          item.sessionAdjustment &&
          (!item.correctionReason || item.correctionReason.length < 3)
        )
          throw new BadRequestException(
            'Alasan koreksi jumlah sesi wajib diisi, minimal 3 karakter.',
          );
        item.rate = moneyString(moneyMinor(input.rate));
      }
      const extras = dto.adjustments.map((i, index) =>
        m.create(PayrollItemEntity, {
          tenantId,
          payrollId: id,
          studyGroupId: null,
          kind: i.kind,
          description: i.description,
          sourceCount: 0,
          sessionAdjustment: 0,
          correctionReason: null,
          rate: moneyString(moneyMinor(i.amount)),
          sortOrder: teaching.length + index,
        }),
      );
      const items = [...teaching, ...extras];
      const total = payrollTotal(items);
      await m.delete(PayrollItemEntity, { tenantId, payrollId: id });
      await m.save(PayrollItemEntity, items);
      await this.store.event(m, p, 'items_updated', actorId, {
        previousItems,
        items,
        previousTotal: p.total,
        total,
      });
      p.total = total;
      p.version++;
      await m.save(p);
    });
    return this.store.detail(tenantId, id);
  }
  async recalculate(
    tenantId: string,
    id: string,
    actorId: string,
    version: number,
  ) {
    await this.store.db.transaction(async (m) => {
      const p = await this.store.lock(m, tenantId, id);
      this.store.checkEditable(p, version);
      const old = await this.store.items(p, m);
      const sessions = await this.store.sessions(p, m);
      const items = this.store.teachingItems(p, sessions, old, m);
      const total = payrollTotal(items);
      await m.delete(PayrollItemEntity, { tenantId, payrollId: id });
      await m.save(PayrollItemEntity, items);
      await this.store.replaceSources(p, sessions, m);
      await this.store.event(m, p, 'recalculated', actorId, {
        previousItems: old,
        items,
        previousTotal: p.total,
        total,
      });
      p.total = total;
      p.version++;
      await m.save(p);
    });
    return this.store.detail(tenantId, id);
  }
  async tutorDetail(tenantId: string, userId: string, id: string) {
    const tutor = await this.store.myTutor(tenantId, userId);
    const p = await this.store.require(tenantId, id);
    if (p.tutorId !== tutor.id || !p.paidAt)
      throw new NotFoundException('Slip gaji tidak ditemukan.');
    const result = await this.store.detail(tenantId, id);
    return {
      ...result,
      events: [],
      payments: result.payments.filter((p) => !p.reversedAt),
    };
  }
  async tutorList(tenantId: string, userId: string, q: PayrollQueryDto) {
    const tutor = await this.store.myTutor(tenantId, userId);
    return this.list(tenantId, { ...q, tutorId: tutor.id, status: 'paid' });
  }
  async *export(tenantId: string, q: PayrollQueryDto) {
    const cell = (value: string) =>
      `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    yield '\uFEFFNomor,Tentor,Mulai,Akhir,Jatuh Tempo,Total,Status\r\n';
    let page = 1;
    for (;;) {
      const result = await this.list(tenantId, { ...q, page, limit: 100 });
      for (const p of result.data)
        yield [
          p.number,
          p.tutorName,
          p.startDate,
          p.endDate,
          p.payDate,
          p.total,
          p.status,
        ]
          .map(cell)
          .join(',') + '\r\n';
      if (page >= result.meta.totalPages) return;
      page++;
    }
  }
}
