import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { TenantEntity } from '../../tenants/entities/tenant.entity.js';

@Entity({ name: 'study_groups' })
@Index('IDX_study_groups_tenant_status', ['tenantId', 'status'])
export class StudyGroupEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @ManyToOne(() => TenantEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' }) tenant: TenantEntity;
  @Column({ type: 'varchar', length: 150 }) name: string;
  @Column({ type: 'enum', enum: EntityStatus, default: EntityStatus.Active }) status: EntityStatus;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 }) updatedAt: Date;
}
