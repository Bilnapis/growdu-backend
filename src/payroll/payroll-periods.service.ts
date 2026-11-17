import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { jakartaDate, shiftCalendarDate } from '../common/jakarta-date.js';
import {
  PayrollPeriodEntity,
  PayrollSettingsEntity,
} from './entities/payroll.entity.js';
import { firstCycle, followingCycle, nextPayDate } from './payroll-rules.js';
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
        open.payDate = nextPayDate(today, dto.payday, open.startDate);
        open.endDate = shiftCalendarDate(open.payDate, -1);
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
    if (period.payDate > today || period.endDate >= today)
      throw new BadRequestException(
        'Penggajian hanya dapat dibuat untuk siklus yang sudah berakhir.',
      );
    return period;
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
    await m.save(period);
  }
}
