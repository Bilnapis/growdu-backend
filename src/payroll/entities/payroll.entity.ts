import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { PayrollItemKind } from '../payroll-rules.js';

export interface PayrollIdentity {
  tenantName: string;
  tenantAddress: string | null;
  tutorName: string;
  tutorPhone: string;
  tutorEmail: string | null;
  subject: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
}
export interface SlipItem {
  kind: PayrollItemKind;
  description: string;
  sourceCount: number;
  sessionAdjustment: number;
  correctionReason: string | null;
  rate: string;
  subtotal: string;
}
export interface PayrollSlip extends PayrollIdentity {
  number: string;
  startDate: string;
  endDate: string;
  payDate: string;
  total: string;
  items: SlipItem[];
  sources: PayrollSlipSource[];
}
export interface PayrollSlipSource {
  sessionId: string;
  sessionDate: string;
  studyGroupId: string;
  studyGroupName: string;
  version: number;
}

@Entity('payroll_settings')
export class PayrollSettingsEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;
  @Column({ type: 'tinyint', unsigned: true, default: 1 }) payday: number;
  @Column({ type: 'boolean', default: false }) enabled: boolean;
  @Column({ name: 'activated_date', type: 'date' }) activatedDate: string;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
@Entity('payroll_periods')
@Index('UQ_payroll_period_date', ['tenantId', 'payDate'], { unique: true })
@Index('UQ_payroll_period_tenant', ['tenantId', 'id'], { unique: true })
export class PayrollPeriodEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'end_date', type: 'date' }) endDate: string;
  @Column({ name: 'pay_date', type: 'date' }) payDate: string;
  @Column({ name: 'generated_at', type: 'datetime', nullable: true })
  generatedAt: Date | null;
  @Column({ name: 'processed_at', type: 'datetime', nullable: true })
  processedAt: Date | null;
}
@Entity('payrolls')
@Index('UQ_payroll_tutor_period', ['tenantId', 'tutorId', 'periodId'], {
  unique: true,
})
@Index('UQ_payroll_number', ['tenantId', 'number'], { unique: true })
@Index('UQ_payroll_tenant', ['tenantId', 'id'], { unique: true })
@Index('IDX_payroll_due', ['tenantId', 'payDate', 'paidAt'])
export class PayrollEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'tutor_id', type: 'char', length: 36 }) tutorId: string;
  @Column({ name: 'period_id', type: 'char', length: 36 }) periodId: string;
  @Column({ length: 40 }) number: string;
  @Column({ name: 'tutor_name', length: 150 }) tutorName: string;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'end_date', type: 'date' }) endDate: string;
  @Column({ name: 'pay_date', type: 'date' }) payDate: string;
  @Column({ name: 'issued_date', type: 'date' }) issuedDate: string;
  @Column({ name: 'default_rate', type: 'decimal', precision: 14, scale: 2 })
  defaultRate: string;
  @Column({ type: 'json' }) snapshot: PayrollIdentity;
  @Column({ type: 'decimal', precision: 14, scale: 2 }) total: string;
  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null;
  @Column({ type: 'int', unsigned: true, default: 1 }) version: number;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
@Entity('payroll_items')
@Index('IDX_payroll_items', ['tenantId', 'payrollId'])
export class PayrollItemEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'payroll_id', type: 'char', length: 36 }) payrollId: string;
  @Column({ name: 'study_group_id', type: 'char', length: 36, nullable: true })
  studyGroupId: string | null;
  @Column({ type: 'varchar', length: 12 }) kind: PayrollItemKind;
  @Column({ length: 200 }) description: string;
  @Column({ name: 'source_count', type: 'int', unsigned: true, default: 0 })
  sourceCount: number;
  @Column({ name: 'session_adjustment', type: 'int', default: 0 })
  sessionAdjustment: number;
  @Column({
    name: 'correction_reason',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  correctionReason: string | null;
  @Column({ type: 'decimal', precision: 14, scale: 2 }) rate: string;
  @Column({ name: 'sort_order', type: 'int', unsigned: true })
  sortOrder: number;
}
@Entity('payroll_sources')
@Index('UQ_payroll_source_session', ['tenantId', 'sessionId'], { unique: true })
@Index('IDX_payroll_sources', ['tenantId', 'payrollId'])
export class PayrollSourceEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'payroll_id', type: 'char', length: 36 }) payrollId: string;
  @Column({ name: 'session_id', type: 'char', length: 36 }) sessionId: string;
  @Column({ name: 'session_version', type: 'int' }) sessionVersion: number;
}
@Entity('payroll_payments')
@Index('UQ_payroll_payment_request', ['tenantId', 'requestId'], {
  unique: true,
})
@Index('IDX_payroll_payments', ['tenantId', 'payrollId'])
export class PayrollPaymentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'payroll_id', type: 'char', length: 36 }) payrollId: string;
  @Column({ name: 'request_id', type: 'char', length: 36 }) requestId: string;
  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash: string;
  @Column({ type: 'json' }) snapshot: PayrollSlip;
  @Column({ type: 'decimal', precision: 14, scale: 2 }) amount: string;
  @Column({ name: 'paid_at', type: 'datetime' }) paidAt: Date;
  @Column({ name: 'paid_date', type: 'date' }) paidDate: string;
  @Column({ type: 'varchar', length: 20 }) method: 'cash' | 'bank_transfer';
  @Column({ type: 'varchar', length: 100, nullable: true }) reference:
    string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) note:
    string | null;
  @Column({ name: 'recorded_by', type: 'char', length: 36 }) recordedBy: string;
  @Column({ name: 'recorded_by_name', length: 150 }) recordedByName: string;
  @Column({
    name: 'proof_key',
    type: 'varchar',
    length: 60,
    nullable: true,
    select: false,
  })
  proofKey: string | null;
  @Column({ name: 'proof_name', type: 'varchar', length: 200, nullable: true })
  proofName: string | null;
  @Column({ name: 'proof_mime', type: 'varchar', length: 20, nullable: true })
  proofMime: string | null;
  @Column({ name: 'reversed_at', type: 'datetime', nullable: true })
  reversedAt: Date | null;
  @Column({
    name: 'reversal_reason',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  reversalReason: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
@Entity('payroll_events')
@Index('IDX_payroll_events', ['tenantId', 'payrollId'])
export class PayrollEventEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'payroll_id', type: 'char', length: 36 }) payrollId: string;
  @Column({ length: 40 }) type: string;
  @Column({ name: 'actor_id', type: 'char', length: 36, nullable: true })
  actorId: string | null;
  @Column({ type: 'json' }) details: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
@Entity('payroll_sequences')
export class PayrollSequenceEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;
  @PrimaryColumn({ type: 'char', length: 7 }) month: string;
  @Column({ type: 'int', unsigned: true, default: 0 }) value: number;
}
