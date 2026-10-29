import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetricHistoryStateEntity } from './entities/metric-history-state.entity.js';
import { MetricStatusHistoryEntity } from './entities/metric-status-history.entity.js';
import { MetricsHistoryService } from './metrics-history.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MetricStatusHistoryEntity,
      MetricHistoryStateEntity,
    ]),
  ],
  providers: [MetricsHistoryService],
  exports: [MetricsHistoryService],
})
export class MetricsHistoryModule {}
