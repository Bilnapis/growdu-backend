import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('metric_history_state')
export class MetricHistoryStateEntity {
  @PrimaryColumn({ type: 'tinyint', unsigned: true }) id: number;
  @Column({ name: 'started_at', type: 'datetime', precision: 6 })
  startedAt: Date;
}
