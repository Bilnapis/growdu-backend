import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { TenantEntity } from '../../tenants/entities/tenant.entity.js';
import { UserEntity } from '../../users/entities/user.entity.js';

@Entity({ name: 'tutors' })
@Index('IDX_tutors_tenant_id_status', ['tenantId', 'status'])
export class TutorEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;

  @ManyToOne(() => TenantEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @Index('UQ_tutors_user_id', { unique: true })
  @Column({ name: 'user_id', type: 'char', length: 36, nullable: true })
  userId: string | null;

  @OneToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity | null;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ name: 'session_rate', type: 'decimal', precision: 12, scale: 2 })
  sessionRate: string;

  @Column({ type: 'enum', enum: EntityStatus, default: EntityStatus.Active })
  status: EntityStatus;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
