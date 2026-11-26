import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, MoreThan } from 'typeorm';
import { billingDueDate, jakartaDate } from '../common/jakarta-date.js';
import {
  PayrollPeriodEntity,
  PayrollSettingsEntity,
} from './entities/payroll.entity.js';
import {
  calendarCycle,
  firstCycle,
  followingCycle,
  monthOffset,
} from './payroll-rules.js';
import { PayrollStore } from './payroll-store.service.js';
import type { UpdatePayrollSettingsDto } from './dto/payroll-input.dto.js';

@Injectable()
export class PayrollPeriodsService {
  constructor(private readonly store: PayrollStore) {}
  async ensureDefaults(tenantId: string, now = new Date()) {
    const existing = await this.store.db.manager.findOneBy(
      PayrollSettingsEntity,
      { tenantId },
    );
    if (existing) return existing;
    return this.store.db.transaction(async (m) => {
      await this.store.lockTenant(m, tenantId);
      const concurrent = await m.findOneBy(PayrollSettingsEntity, { tenantId });
      if (concurrent) return concurrent;
      const today = jakartaDate(now);
      const settings = await m.save(
        PayrollSettingsEntity,
        m.create(PayrollSettingsEntity, {
          tenantId,
          payday: 1,
          enabled: true,
          activatedDate: today,
        }),
      );
      await m.save(
        PayrollPeriodEntity,
        m.create(PayrollPeriodEntity, {
          tenantId,
          ...firstCycle(today, 1),
          generatedAt: null,
          processedAt: null,
        }),
      );
      return settings;
    });
  }
  async settings(tenantId: string) {
    await this.ensureDefaults(tenantId);
    const [settings, next] = await Promise.all([
      this.store.db.manager.findOneBy(PayrollSettingsEntity, { tenantId }),
      this.store.db.manager.findOne(PayrollPeriodEntity, {
        where: { tenantId },
        order: { payDate: 'DESC' },
      }),
    ]);
    return {
      payday: settings?.payday ?? 1,
      enabled: settings?.enabled ?? true,
      configured: Boolean(settings),
      nextPeriod: next ?? null,
    };
  }
  async list(tenantId: string) {
    await this.ensureDefaults(tenantId);
    return this.store.db.manager.find(PayrollPeriodEntity, {
      where: { tenantId },
      order: { payDate: 'DESC' },
    });
  }
  async update(
    tenantId: string,
    dto: UpdatePayrollSettingsDto,
    now = new Date(),
  ) {
    const today = jakartaDate(now);
    await this.store.db.transaction(async (m) => {
      await this.store.lockTenant(m, tenantId);
      let settings = await m.findOneBy(PayrollSettingsEntity, { tenantId });
      if (!settings) {
        settings = m.create(PayrollSettingsEntity, {
          tenantId,
          payday: dto.payday,
          enabled: dto.enabled,
          activatedDate: today,
        });
        await m.save(settings);
        await m.save(
          PayrollPeriodEntity,
          m.create(PayrollPeriodEntity, {
            tenantId,
            ...firstCycle(today, dto.payday),
            generatedAt: null,
            processedAt: null,
          }),
        );
        return;
      }
      if (settings.payday !== dto.payday) {
        const open = await m.findOne(PayrollPeriodEntity, {
          where: { tenantId },
          order: { payDate: 'DESC' },
        });
        if (!open || open.generatedAt)
          throw new BadRequestException(
            'Siklus berjalan tidak tersedia. Muat ulang pengaturan.',
          );
        open.payDate = billingDueDate(open.payDate.slice(0, 7), dto.payday);
        await m.save(open);
      }
      settings.payday = dto.payday;
      settings.enabled = dto.enabled;
      await m.save(settings);
    });
    return this.settings(tenantId);
  }
  async require(m: EntityManager, tenantId: string, id: string, today: string) {
    const period = await m.findOneBy(PayrollPeriodEntity, { tenantId, id });
    if (!period)
      throw new NotFoundException('Periode penggajian tidak ditemukan.');
    if (period.endDate >= today)
      throw new BadRequestException(
        'Penggajian hanya dapat dibuat setelah periode sesi berakhir.',
      );
    return period;
  }
  /** Caller holds the tenant lock for both period resolution and generation. */
  async forMonth(
    m: EntityManager,
    tenantId: string,
    month: string,
    today: string,
  ) {
    if (month >= today.slice(0, 7))
      throw new BadRequestException('Pilih bulan sesi yang sudah selesai.');
    const settings = await m.findOneByOrFail(PayrollSettingsEntity, {
      tenantId,
    });
    const cycle = calendarCycle(
      billingDueDate(monthOffset(`${month}-01`, 1), settings.payday),
    );
    const existing = await m.findOneBy(PayrollPeriodEntity, {
      tenantId,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
    });
    if (existing) return this.require(m, tenantId, existing.id, today);
    return m.save(
      PayrollPeriodEntity,
      m.create(PayrollPeriodEntity, {
        tenantId,
        ...cycle,
        generatedAt: null,
        processedAt: null,
      }),
    );
  }
  async close(
    m: EntityManager,
    period: PayrollPeriodEntity,
    now: Date,
    all: boolean,
  ) {
    if (all) period.processedAt = now;
    if (!period.generatedAt) {
      period.generatedAt = now;
      const settings = await m.findOneByOrFail(PayrollSettingsEntity, {
        tenantId: period.tenantId,
      });
      // Backfilled months must not insert cycles into an existing automation schedule.
      const later = await m.existsBy(PayrollPeriodEntity, {
        tenantId: period.tenantId,
        payDate: MoreThan(period.payDate),
      });
      if (!later) {
        await m.save(
          PayrollPeriodEntity,
          m.create(PayrollPeriodEntity, {
            tenantId: period.tenantId,
            ...followingCycle(period.payDate, settings.payday),
            generatedAt: null,
            processedAt: null,
          }),
        );
      }
    }
    await m.save(period);
  }
}
