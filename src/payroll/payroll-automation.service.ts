import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { IsNull, LessThanOrEqual } from 'typeorm';
import appConfig from '../config/app.config.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { jakartaDate } from '../common/jakarta-date.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { PayrollPeriodEntity } from './entities/payroll.entity.js';
import { PayrollStore } from './payroll-store.service.js';
import { PayrollGenerationService } from './payroll-generation.service.js';
import { PayrollPeriodsService } from './payroll-periods.service.js';

@Injectable()
export class PayrollAutomationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PayrollAutomationService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  private stopping = false;
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly store: PayrollStore,
    private readonly generation: PayrollGenerationService,
    private readonly periods: PayrollPeriodsService,
  ) {}
  onApplicationBootstrap() {
    if (this.config.nodeEnv === 'test' || !this.config.payrollAutomationEnabled)
      return;
    void this.run();
    this.timer = setInterval(() => void this.run(), 60_000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  run(now = new Date()): Promise<void> {
    if (this.running) return this.running;
    this.running = this.execute(now)
      .catch(() =>
        this.logger.error(
          'Payroll automation failed; retrying on the next run.',
        ),
      )
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async execute(now: Date) {
    const tenants = await this.store.db.manager.find(TenantEntity, {
      where: { status: EntityStatus.Active },
      select: { id: true },
      order: { id: 'ASC' },
    });
    for (const tenant of tenants) {
      if (this.stopping) break;
      try {
        const setting = await this.periods.ensureDefaults(tenant.id, now);
        if (!setting.enabled) continue;
        // Bound recovery work per tick; remaining closed cycles are retried next minute.
        for (let batch = 0; batch < 24 && !this.stopping; batch++) {
          const period = await this.store.db.manager.findOne(
            PayrollPeriodEntity,
            {
              where: {
                tenantId: setting.tenantId,
                processedAt: IsNull(),
                payDate: LessThanOrEqual(jakartaDate(now)),
              },
              order: { payDate: 'ASC' },
            },
          );
          if (!period) break;
          const result = await this.generation.generate(
            setting.tenantId,
            period.id,
            null,
            undefined,
            now,
          );
          this.logger.log(
            JSON.stringify({
              event: 'payroll_generation',
              tenantId: setting.tenantId,
              ...result,
            }),
          );
        }
      } catch {
        this.logger.error(
          JSON.stringify({
            event: 'payroll_generation_failed',
            tenantId: tenant.id,
          }),
        );
      }
    }
  }
}
