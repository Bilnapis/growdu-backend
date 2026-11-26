import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Between } from 'typeorm';
import { jakartaDate } from '../common/jakarta-date.js';
import { ClassSessionEntity } from '../class-sessions/entities/class-session.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import {
  PayrollEntity,
  PayrollItemEntity,
  PayrollSequenceEntity,
} from './entities/payroll.entity.js';
import { moneyMinor, moneyString, payrollTotal } from './payroll-rules.js';
import { PayrollPeriodsService } from './payroll-periods.service.js';
import { PayrollStore } from './payroll-store.service.js';

@Injectable()
export class PayrollGenerationService {
  constructor(
    private readonly store: PayrollStore,
    private readonly periods: PayrollPeriodsService,
  ) {}
  async generateMonth(
    tenantId: string,
    sessionMonth: string,
    actorId: string,
    tutorId?: string,
    now = new Date(),
  ) {
    await this.periods.ensureDefaults(tenantId, now);
    return this.generate(tenantId, { sessionMonth }, actorId, tutorId, now);
  }
  async generate(
    tenantId: string,
    target: string | { sessionMonth: string },
    actorId: string | null,
    tutorId?: string,
    now = new Date(),
  ) {
    return this.store.db.transaction(async (m) => {
      const tenant = await this.store.lockTenant(m, tenantId);
      const today = jakartaDate(now);
      const period =
        typeof target === 'string'
          ? await this.periods.require(m, tenantId, target, today)
          : await this.periods.forMonth(
              m,
              tenantId,
              target.sessionMonth,
              today,
            );
      const periodId = period.id;
      const tutors = await m.find(TutorEntity, {
        where: { tenantId, ...(tutorId ? { id: tutorId } : {}) },
        order: { id: 'ASC' },
      });
      if (tutorId && !tutors.length)
        throw new NotFoundException('Tentor tidak ditemukan.');
      const sessions = await m.find(ClassSessionEntity, {
        where: {
          tenantId,
          sessionDate: Between(period.startDate, period.endDate),
          status: 'completed',
          ...(tutorId ? { tutorId } : {}),
        },
        order: { sessionDate: 'ASC', id: 'ASC' },
      });
      const byTutor = new Map<string, ClassSessionEntity[]>();
      for (const session of sessions) {
        const values = byTutor.get(session.tutorId) ?? [];
        values.push(session);
        byTutor.set(session.tutorId, values);
      }
      const result = {
        periodId,
        created: 0,
        skippedExisting: 0,
        skippedMissingRate: 0,
        skippedNoSessions: 0,
      };
      for (const tutor of tutors) {
        if (
          await m.existsBy(PayrollEntity, {
            tenantId,
            tutorId: tutor.id,
            periodId,
          })
        ) {
          result.skippedExisting++;
          continue;
        }
        const source = byTutor.get(tutor.id) ?? [];
        if (!source.length) {
          result.skippedNoSessions++;
          continue;
        }
        if (!moneyMinor(tutor.sessionRate)) {
          result.skippedMissingRate++;
          continue;
        }
        const month = period.payDate.slice(0, 7);
        await m
          .createQueryBuilder()
          .insert()
          .into(PayrollSequenceEntity)
          .values({ tenantId, month, value: 0 })
          .orIgnore()
          .execute();
        const sequence = await m.findOneOrFail(PayrollSequenceEntity, {
          where: { tenantId, month },
          lock: { mode: 'pessimistic_write' },
        });
        sequence.value++;
        await m.save(sequence);
        const payroll = m.create(PayrollEntity, {
          tenantId,
          tutorId: tutor.id,
          periodId,
          number: `PAY-${month.replace('-', '')}-${String(sequence.value).padStart(3, '0')}`,
          tutorName: tutor.name,
          startDate: period.startDate,
          endDate: period.endDate,
          payDate: period.payDate,
          issuedDate: jakartaDate(now),
          defaultRate: moneyString(moneyMinor(tutor.sessionRate)),
          total: '0.00',
          paidAt: null,
          version: 1,
          snapshot: {
            tenantName: tenant.name,
            tenantAddress: tenant.address,
            tutorName: tutor.name,
            tutorPhone: tutor.phoneNumber,
            tutorEmail: tutor.email,
            subject: tutor.expertise,
            bankName: tutor.bankName,
            accountName: tutor.accountName,
            accountNumber: tutor.accountNumber,
          },
        });
        // Assign the UUID before deriving child rows; all writes remain in this transaction.
        payroll.id = randomUUID();
        const items = this.store.teachingItems(payroll, source, [], m);
        payroll.total = payrollTotal(items);
        await m.save(payroll);
        await m.save(PayrollItemEntity, items);
        await this.store.replaceSources(payroll, source, m);
        await this.store.event(m, payroll, 'generated', actorId, {
          total: payroll.total,
          sourceSessions: source.length,
          rate: payroll.defaultRate,
        });
        result.created++;
      }
      await this.periods.close(m, period, now, !tutorId);
      return result;
    });
  }
}
