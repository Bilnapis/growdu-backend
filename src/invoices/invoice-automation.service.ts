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
import { InvoiceGenerationService } from './invoice-generation.service.js';
import { InvoiceStore } from './invoice-store.service.js';

@Injectable()
export class InvoiceAutomationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InvoiceAutomationService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly store: InvoiceStore,
    private readonly generation: InvoiceGenerationService,
  ) {}
  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test' || !this.config.invoiceAutomationEnabled)
      return;
    void this.run();
    this.timer = setInterval(() => void this.run(), 60_000);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  private run(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.execute()
      .catch(() => {
        this.logger.error(
          'Invoice automation failed; it will retry on the next run.',
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async execute(): Promise<void> {
    const tenants = await this.store.db.manager.find(TenantEntity, {
      where: { status: EntityStatus.Active },
      select: { id: true },
      order: { id: 'ASC' },
    });
    for (const tenant of tenants) {
      try {
        const result = await this.generation.generate(tenant.id, false);
        if (result.created)
          this.logger.log(
            JSON.stringify({
              event: 'invoice_generation',
              tenantId: tenant.id,
              ...result,
            }),
          );
      } catch {
        this.logger.error(
          JSON.stringify({
            event: 'invoice_generation_failed',
            tenantId: tenant.id,
          }),
        );
      }
    }
  }
}
