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
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { TenantEntity } from '../../tenants/entities/tenant.entity.js';

export enum UserRole {
  Owner = 'owner',
  Admin = 'admin',
  Tutor = 'tutor',
  Parent = 'parent',
}

@Entity({ name: 'users' })
@Index('UQ_users_tenant_id_id', ['tenantId', 'id'], { unique: true })
@Index('IDX_users_tenant_id_status', ['tenantId', 'status'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;

  @ManyToOne(() => TenantEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @Index('UQ_users_email', { unique: true })
  @Column({ type: 'varchar', length: 150 })
  email: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'enum', enum: EntityStatus, default: EntityStatus.Active })
  status: EntityStatus;

  @Column({
    name: 'last_login_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
