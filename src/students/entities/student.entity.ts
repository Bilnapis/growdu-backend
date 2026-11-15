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

export enum StudentGender {
  Male = 'male',
  Female = 'female',
}

@Entity({ name: 'students' })
@Index('UQ_students_tenant_id_student_code', ['tenantId', 'studentCode'], {
  unique: true,
})
@Index('UQ_students_tenant_id_id', ['tenantId', 'id'], { unique: true })
@Index('IDX_students_tenant_id_status', ['tenantId', 'status'])
@Index('IDX_students_billing', ['tenantId', 'status', 'nextInvoicePeriod'])
export class StudentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;

  @ManyToOne(() => TenantEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;

  @Column({ name: 'student_code', type: 'varchar', length: 30 })
  studentCode: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'enum', enum: StudentGender })
  gender: StudentGender;

  @Column({ name: 'education_level', type: 'varchar', length: 50 })
  educationLevel: string;

  @Column({ type: 'varchar', length: 150 })
  school: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 20, nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'text' })
  address: string;

  @Column({ type: 'enum', enum: EntityStatus, default: EntityStatus.Active })
  status: EntityStatus;

  @Column({
    name: 'administrative_status',
    type: 'enum',
    enum: EntityStatus,
    default: EntityStatus.Active,
  })
  administrativeStatus: EntityStatus;

  @Column({ name: 'billing_blocked', type: 'boolean', default: false })
  billingBlocked: boolean;

  @Column({ name: 'monthly_fee', type: 'int', unsigned: true, nullable: true })
  monthlyFee: number | null;

  @Column({
    name: 'next_invoice_period',
    type: 'char',
    length: 7,
    nullable: true,
  })
  nextInvoicePeriod: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
