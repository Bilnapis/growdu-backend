import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { jakartaDate } from '../class-sessions/session-dates.js';
import { MetricHistoryStateEntity } from './entities/metric-history-state.entity.js';
import {
  MetricStatusHistoryEntity,
  type MetricEntityType,
} from './entities/metric-status-history.entity.js';

@Injectable()
export class MetricsHistoryService {
  constructor(
    @InjectRepository(MetricStatusHistoryEntity)
    private readonly history: Repository<MetricStatusHistoryEntity>,
    @InjectRepository(MetricHistoryStateEntity)
    private readonly state: Repository<MetricHistoryStateEntity>,
  ) {}

  async getPreviousMonthActive(
    tenantId: string,
    entityType: MetricEntityType,
    now = new Date(),
  ): Promise<number | null> {
    const today = jakartaDate(now);
    const cutoff = new Date(`${today.slice(0, 7)}-01T00:00:00+07:00`);
    const tracking = await this.state.findOneBy({ id: 1 });

    // Initial snapshots describe the migration date, never an earlier month.
    if (!tracking || tracking.startedAt >= cutoff) return null;

    return this.history
      .createQueryBuilder('history')
      .where('history.tenant_id = :tenantId', { tenantId })
      .andWhere('history.entity_type = :entityType', { entityType })
      .andWhere("history.status = 'active'")
      .andWhere('history.recorded_at < :cutoff', { cutoff })
      .andWhere(
        `NOT EXISTS (
        SELECT 1 FROM metric_status_history newer
        WHERE newer.tenant_id = history.tenant_id
          AND newer.entity_type = history.entity_type
          AND newer.entity_id = history.entity_id
          AND newer.recorded_at < :cutoff
          AND (newer.recorded_at > history.recorded_at
            OR (newer.recorded_at = history.recorded_at AND newer.id > history.id))
      )`,
      )
      .getCount();
  }
}
