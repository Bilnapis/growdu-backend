import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue';
export type InvoiceItemKind = 'tuition' | 'charge' | 'discount';
export type PaymentMethod = 'cash' | 'bank_transfer';

export interface InvoiceBankAccount {
  bankName: string;
  branch: string;
  accountNumber: string;
  accountHolder: string;
}

export interface InvoiceSnapshot {
  tenantName: string;
  tenantAddress: string | null;
  studentCode: string;
  studentName: string;
  educationLevel: string;
  school: string;
  address: string;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  groups: { id: string; name: string }[];
  bankAccount: InvoiceBankAccount | null;
}

const money = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value),
};

@Entity('invoice_settings')
export class InvoiceSettingsEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;
  @Column({ name: 'due_day', type: 'tinyint', unsigned: true, default: 1 })
  dueDay: number;
  @Column({ name: 'grace_days', type: 'smallint', unsigned: true, default: 0 })
  graceDays: number;
  @Column({ name: 'bank_account', type: 'json', nullable: true })
  bankAccount: InvoiceBankAccount | null;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}

@Entity('invoices')
@Index('UQ_invoices_student_period', ['tenantId', 'studentId', 'period'], {
  unique: true,
})
@Index('UQ_invoices_number', ['tenantId', 'number'], { unique: true })
@Index('UQ_invoices_tenant_id', ['tenantId', 'id'], { unique: true })
@Index('IDX_invoices_period', ['tenantId', 'period'])
@Index('IDX_invoices_due', ['tenantId', 'paidAt', 'suspensionDate'])
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'student_id', type: 'char', length: 36 }) studentId: string;
  @Column({ type: 'varchar', length: 40 }) number: string;
  @Column({ type: 'char', length: 7 }) period: string;
  @Column({ name: 'issued_date', type: 'date' }) issuedDate: string;
  @Column({ name: 'due_date', type: 'date' }) dueDate: string;
  @Column({ name: 'grace_days', type: 'smallint', unsigned: true })
  graceDays: number;
  /** First WIB date on which an unpaid invoice blocks the student. */
  @Column({ name: 'suspension_date', type: 'date' }) suspensionDate: string;
  @Column({ name: 'student_name', type: 'varchar', length: 150 })
  studentName: string;
  @Column({ type: 'json' }) snapshot: InvoiceSnapshot;
  @Column({ type: 'decimal', precision: 14, scale: 0, transformer: money })
  total: number;
  @Column({ name: 'paid_at', type: 'datetime', precision: 6, nullable: true })
  paidAt: Date | null;
  @Column({ type: 'int', unsigned: true, default: 1 }) version: number;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}

@Entity('invoice_items')
@Index('IDX_invoice_items_invoice', ['tenantId', 'invoiceId'])
export class InvoiceItemEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'invoice_id', type: 'char', length: 36 }) invoiceId: string;
  @Column({ type: 'varchar', length: 10 }) kind: InvoiceItemKind;
  @Column({ type: 'varchar', length: 200 }) description: string;
  @Column({ type: 'smallint', unsigned: true }) quantity: number;
  @Column({ name: 'unit_amount', type: 'int', unsigned: true })
  unitAmount: number;
  @Column({ name: 'sort_order', type: 'smallint', unsigned: true })
  sortOrder: number;
}

@Entity('invoice_payments')
@Index('UQ_invoice_payment_request', ['tenantId', 'requestId'], {
  unique: true,
})
@Index('IDX_invoice_payments_invoice', ['tenantId', 'invoiceId'])
export class InvoicePaymentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'invoice_id', type: 'char', length: 36 }) invoiceId: string;
  @Column({ name: 'request_id', type: 'char', length: 36 }) requestId: string;
  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash: string;
  @Column({ type: 'decimal', precision: 14, scale: 0, transformer: money })
  amount: number;
  @Column({ name: 'paid_at', type: 'datetime', precision: 6 }) paidAt: Date;
  @Column({ type: 'varchar', length: 20 }) method: PaymentMethod;
  @Column({ type: 'varchar', length: 100, nullable: true }) reference:
    string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) note:
    string | null;
  @Column({ name: 'recorded_by', type: 'char', length: 36 }) recordedBy: string;
  @Column({ name: 'recorded_by_name', type: 'varchar', length: 150 })
  recordedByName: string;
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
  @Column({
    name: 'reversed_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
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

@Entity('invoice_events')
@Index('IDX_invoice_events_invoice', ['tenantId', 'invoiceId'])
export class InvoiceEventEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'invoice_id', type: 'char', length: 36 }) invoiceId: string;
  @Column({ type: 'varchar', length: 40 }) type: string;
  @Column({ name: 'actor_id', type: 'char', length: 36, nullable: true })
  actorId: string | null;
  @Column({ type: 'json' }) details: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}

@Entity('invoice_sequences')
export class InvoiceSequenceEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;
  @PrimaryColumn({ type: 'char', length: 7 }) period: string;
  @Column({ type: 'int', unsigned: true, default: 0 }) value: number;
}
