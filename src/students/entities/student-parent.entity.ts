import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { ParentEntity } from '../../parents/entities/parent.entity.js';
import { StudentEntity } from './student.entity.js';

export enum ParentRelationship {
  Father = 'father',
  Mother = 'mother',
  Guardian = 'guardian',
}

@Entity({ name: 'student_parents' })
@Index('IDX_student_parents_tenant_id_parent_id', ['tenantId', 'parentId'])
export class StudentParentEntity {
  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;

  @PrimaryColumn({ name: 'student_id', type: 'char', length: 36 })
  studentId: string;

  @ManyToOne(() => StudentEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: StudentEntity;

  @PrimaryColumn({ name: 'parent_id', type: 'char', length: 36 })
  parentId: string;

  @ManyToOne(() => ParentEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent: ParentEntity;

  @Column({ type: 'enum', enum: ParentRelationship })
  relationship: ParentRelationship;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({
    name: 'access_status',
    type: 'enum',
    enum: EntityStatus,
    default: EntityStatus.Active,
  })
  accessStatus: EntityStatus;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
