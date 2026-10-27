import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from '../../tenants/entities/tenant.entity.js';
import { AnnouncementTargetRole } from '../announcement.types.js';

@Entity({ name: 'announcements' })
@Index('IDX_announcements_tenant_target_start_end', [
  'tenantId',
  'targetRole',
  'startsAt',
  'endsAt',
])
@Index('IDX_announcements_tenant_created', ['tenantId', 'createdAt'])
export class AnnouncementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;

  @ManyToOne(() => TenantEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'target_role', type: 'enum', enum: AnnouncementTargetRole })
  targetRole: AnnouncementTargetRole;

  // Canonical UTC strings avoid dependence on the MySQL driver's local timezone.
  @Column({ name: 'starts_at', type: 'char', length: 24, nullable: true })
  startsAt: string | null;

  @Column({ name: 'ends_at', type: 'char', length: 24, nullable: true })
  endsAt: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
