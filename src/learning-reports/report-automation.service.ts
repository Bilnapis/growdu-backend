import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import appConfig from '../config/app.config.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { DataSource } from 'typeorm';
import { jakartaDate } from '../common/jakarta-date.js';
import { LearningReportSettingsEntity } from './entities/learning-report.entity.js';
import { ReportGenerationService } from './report-generation.service.js';

@Injectable()
export class ReportAutomationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ReportAutomationService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  private stopping = false;
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly db: DataSource,
    private readonly generation: ReportGenerationService,
  ) {}
  onApplicationBootstrap() {
    if (
      this.config.nodeEnv === 'test' ||
      !this.config.learningReportAutomationEnabled
    )
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
          'Learning report automation failed; retrying next minute.',
        ),
      )
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async execute(now: Date) {
    let cursor = '';
    while (!this.stopping) {
      const tenants = await this.db
        .createQueryBuilder(TenantEntity, 'tenant')
        .leftJoin(
          LearningReportSettingsEntity,
          'settings',
          'settings.tenant_id=tenant.id',
        )
        .select('tenant.id')
        .where('tenant.status=:active AND tenant.id>:cursor', {
          active: EntityStatus.Active,
          cursor,
        })
        .andWhere(
          '(settings.tenant_id IS NULL OR (settings.enabled=TRUE AND settings.next_run_date<=:today))',
          { today: jakartaDate(now) },
        )
        .orderBy('tenant.id', 'ASC')
        .take(100)
        .getMany();
      if (!tenants.length) return;
      for (const tenant of tenants) {
        if (this.stopping) return;
        try {
          const results = await this.generation.processDue(tenant.id, now);
          if (results.length)
            this.logger.log(
              JSON.stringify({
                event: 'learning_report_generation',
                tenantId: tenant.id,
                results,
              }),
            );
        } catch {
          this.logger.error(
            JSON.stringify({
              event: 'learning_report_generation_failed',
              tenantId: tenant.id,
            }),
          );
        }
        cursor = tenant.id;
      }
    }
  }
}
