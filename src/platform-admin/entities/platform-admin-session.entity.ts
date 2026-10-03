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
import { PlatformAdminEntity } from './platform-admin.entity.js';

@Entity({ name: 'platform_admin_sessions' })
@Index('IDX_platform_admin_sessions_admin_id_revoked_at', ['platformAdminId', 'revokedAt'])
@Index('IDX_platform_admin_sessions_expires_at', ['expiresAt'])
export class PlatformAdminSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'platform_admin_id', type: 'char', length: 36 })
  platformAdminId: string;

  @ManyToOne(() => PlatformAdminEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_admin_id' })
  platformAdmin: PlatformAdminEntity;

  @Column({ name: 'refresh_token_hash', type: 'char', length: 64 })
  refreshTokenHash: string;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'datetime', precision: 6, nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
