import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Between, DataSource, EntityManager } from 'typeorm';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { ClassSessionEntity } from '../class-sessions/entities/class-session.entity.js';
import { jakartaDate } from '../common/jakarta-date.js';
import {
  PayrollEntity,
  PayrollEventEntity,
  PayrollItemEntity,
  PayrollPaymentEntity,
  PayrollSourceEntity,
  type PayrollSlip,
} from './entities/payroll.entity.js';
import { itemSubtotal, moneyString, payrollStatus } from './payroll-rules.js';

@Injectable()
export class PayrollStore {
  constructor(readonly db: DataSource) {}

  /** Shared with attendance writes: tenant first, payroll next, then source sessions. */
  async lockTenant(m: EntityManager, tenantId: string) {
    const tenant = await m.findOne(TenantEntity, {
      where: { id: tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!tenant) throw new NotFoundException('Bimbel tidak ditemukan.');
    return tenant;
  }
  async require(tenantId: string, id: string, m = this.db.manager) {
    const payroll = await m.findOneBy(PayrollEntity, { tenantId, id });
    if (!payroll) throw new NotFoundException('Penggajian tidak ditemukan.');
    return payroll;
  }
  async lock(m: EntityManager, tenantId: string, id: string) {
    await this.lockTenant(m, tenantId);
    const payroll = await m.findOne(PayrollEntity, {
      where: { tenantId, id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payroll) throw new NotFoundException('Penggajian tidak ditemukan.');
    return payroll;
  }
  checkEditable(payroll: PayrollEntity, version: number) {
    if (payroll.paidAt)
      throw new ConflictException(
        'Batalkan pembayaran sebelum mengubah penggajian.',
      );
    if (payroll.version !== version)
      throw new ConflictException(
        'Penggajian berubah. Muat ulang data sebelum melanjutkan.',
      );
  }
  items(p: PayrollEntity, m = this.db.manager) {
    return m.find(PayrollItemEntity, {
      where: { tenantId: p.tenantId, payrollId: p.id },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }
  sessions(
    p: Pick<PayrollEntity, 'tenantId' | 'tutorId' | 'startDate' | 'endDate'>,
    m = this.db.manager,
  ) {
    return m.find(ClassSessionEntity, {
      where: {
        tenantId: p.tenantId,
        tutorId: p.tutorId,
        sessionDate: Between(p.startDate, p.endDate),
        status: 'completed',
      },
      order: { sessionDate: 'ASC', id: 'ASC' },
    });
  }
  async sourceChanged(p: PayrollEntity, m = this.db.manager) {
    const [sessions, sources] = await Promise.all([
      this.sessions(p, m),
      m.findBy(PayrollSourceEntity, { tenantId: p.tenantId, payrollId: p.id }),
    ]);
    const versions = new Map(
      sources.map((s) => [s.sessionId, s.sessionVersion]),
    );
    return (
      sessions.length !== sources.length ||
      sessions.some((s) => versions.get(s.id) !== s.version)
    );
  }
  async replaceSources(
    p: PayrollEntity,
    sessions: ClassSessionEntity[],
    m: EntityManager,
  ) {
    await m.delete(PayrollSourceEntity, {
      tenantId: p.tenantId,
      payrollId: p.id,
    });
    if (sessions.length)
      await m.save(
        PayrollSourceEntity,
        sessions.map((s) =>
          m.create(PayrollSourceEntity, {
            tenantId: p.tenantId,
            payrollId: p.id,
            sessionId: s.id,
            sessionVersion: s.version,
          }),
        ),
      );
  }
  teachingItems(
    p: PayrollEntity,
    sessions: ClassSessionEntity[],
    old: PayrollItemEntity[],
    m: EntityManager,
  ) {
    const groups = new Map<string, { name: string; count: number }>();
    for (const s of sessions) {
      const group = groups.get(s.studyGroupId) ?? {
        name: s.studyGroupName,
        count: 0,
      };
      group.count += 1;
      groups.set(s.studyGroupId, group);
    }
    const items = old
      .filter((i) => i.kind === 'teaching')
      .map((i) => ({
        ...i,
        sourceCount: i.studyGroupId
          ? (groups.get(i.studyGroupId)?.count ?? 0)
          : 0,
      }));
    const existing = new Set(items.map((i) => i.studyGroupId));
    for (const [studyGroupId, group] of groups) {
      if (!existing.has(studyGroupId))
        items.push(
          m.create(PayrollItemEntity, {
            tenantId: p.tenantId,
            payrollId: p.id,
            studyGroupId,
            kind: 'teaching',
            description: group.name,
            sourceCount: group.count,
            sessionAdjustment: 0,
            correctionReason: null,
            rate: p.defaultRate,
            sortOrder: items.length,
          }),
        );
    }
    return [...items, ...old.filter((i) => i.kind !== 'teaching')].map(
      (i, sortOrder) => m.create(PayrollItemEntity, { ...i, sortOrder }),
    );
  }
  itemView(item: PayrollItemEntity) {
    return {
      id: item.id,
      studyGroupId: item.studyGroupId,
      kind: item.kind,
      description: item.description,
      sourceCount: item.sourceCount,
      sessionAdjustment: item.sessionAdjustment,
      quantity: item.sourceCount + item.sessionAdjustment,
      correctionReason: item.correctionReason,
      rate: item.rate,
      subtotal: moneyString(itemSubtotal(item)),
    };
  }
  listItem(p: PayrollEntity, items: PayrollItemEntity[]) {
    const teaching = items.filter((i) => i.kind === 'teaching');
    const rates = new Set(teaching.map((i) => i.rate));
    return {
      id: p.id,
      tutorId: p.tutorId,
      periodId: p.periodId,
      number: p.number,
      tutorName: p.tutorName,
      startDate: p.startDate,
      endDate: p.endDate,
      payDate: p.payDate,
      issuedDate: p.issuedDate,
      total: p.total,
      totalSessions: teaching.reduce(
        (n, i) => n + i.sourceCount + i.sessionAdjustment,
        0,
      ),
      baseRate: rates.size === 1 ? teaching[0].rate : null,
      status: payrollStatus(p.paidAt, p.payDate, jakartaDate()),
      version: p.version,
    };
  }
  async slip(p: PayrollEntity, m: EntityManager): Promise<PayrollSlip> {
    return {
      ...p.snapshot,
      number: p.number,
      startDate: p.startDate,
      endDate: p.endDate,
      payDate: p.payDate,
      total: p.total,
      items: (await this.items(p, m)).map((i) => this.itemView(i)),
      sources: await this.sourceView(p, m),
    };
  }
  sourceView(p: PayrollEntity, m = this.db.manager) {
    return m
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('s')
      .innerJoin(
        PayrollSourceEntity,
        'source',
        'source.session_id=s.id AND source.tenant_id=s.tenant_id',
      )
      .select('s.id', 'sessionId')
      .addSelect("DATE_FORMAT(s.session_date,'%Y-%m-%d')", 'sessionDate')
      .addSelect('s.study_group_id', 'studyGroupId')
      .addSelect('s.study_group_name', 'studyGroupName')
      .addSelect('source.session_version', 'version')
      .where('source.tenant_id=:tenantId AND source.payroll_id=:payrollId', {
        tenantId: p.tenantId,
        payrollId: p.id,
      })
      .orderBy('s.session_date', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .getRawMany<{
        sessionId: string;
        sessionDate: string;
        studyGroupId: string;
        studyGroupName: string;
        version: number;
      }>();
  }
  async detail(tenantId: string, id: string) {
    const p = await this.require(tenantId, id);
    const [items, payments, events, sourceChanged, sources] = await Promise.all(
      [
        this.items(p),
        this.db.manager.find(PayrollPaymentEntity, {
          where: { tenantId, payrollId: id },
          order: { createdAt: 'DESC', id: 'DESC' },
        }),
        this.db.manager.find(PayrollEventEntity, {
          where: { tenantId, payrollId: id },
          order: { createdAt: 'DESC', id: 'DESC' },
        }),
        p.paidAt ? false : this.sourceChanged(p),
        this.sourceView(p),
      ],
    );
    return {
      ...this.listItem(p, items),
      snapshot: p.snapshot,
      defaultRate: p.defaultRate,
      sourceChanged,
      sources,
      items: items.map((i) => this.itemView(i)),
      payments: payments.map(
        ({
          id,
          amount,
          paidAt,
          method,
          reference,
          note,
          recordedByName,
          proofName,
          reversedAt,
          reversalReason,
        }) => ({
          id,
          amount,
          paidAt,
          method,
          reference,
          note,
          recordedByName,
          proofName,
          reversedAt,
          reversalReason,
        }),
      ),
      events: events.map(({ id, type, actorId, details, createdAt }) => ({
        id,
        type,
        actorId,
        details,
        createdAt,
      })),
    };
  }
  async event(
    m: EntityManager,
    p: PayrollEntity,
    type: string,
    actorId: string | null,
    details: Record<string, unknown> = {},
  ) {
    await m.save(
      PayrollEventEntity,
      m.create(PayrollEventEntity, {
        tenantId: p.tenantId,
        payrollId: p.id,
        type,
        actorId,
        details,
      }),
    );
  }
  async myTutor(tenantId: string, userId: string) {
    const tutor = await this.db.manager.findOneBy(TutorEntity, {
      tenantId,
      userId,
    });
    if (!tutor) throw new NotFoundException('Profil tentor tidak ditemukan.');
    return tutor;
  }
}
