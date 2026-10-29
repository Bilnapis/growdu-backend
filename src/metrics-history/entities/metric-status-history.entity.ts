import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';

export type MetricEntityType = 'student' | 'tutor';

@Entity('metric_status_history')
@Index('IDX_metric_status_history_entity', [
  'tenantId',
  'entityType',
  'entityId',
  'recordedAt',
])
export class MetricStatusHistoryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'entity_type', type: 'enum', enum: ['student', 'tutor'] })
  entityType: MetricEntityType;
  @Column({ name: 'entity_id', type: 'char', length: 36 }) entityId: string;
  @Column({ type: 'enum', enum: EntityStatus }) status: EntityStatus;
  @Column({ name: 'recorded_at', type: 'datetime', precision: 6 })
  recordedAt: Date;
}
