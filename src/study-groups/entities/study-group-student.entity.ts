import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StudentEntity } from '../../students/entities/student.entity.js';
import { TenantEntity } from '../../tenants/entities/tenant.entity.js';
import { StudyGroupEntity } from './study-group.entity.js';

@Entity({ name: 'study_group_students' })
@Index('IDX_study_group_students_tenant_student', ['tenantId', 'studentId'])
export class StudyGroupStudentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({
    name: 'configuration_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  configurationId: string | null;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'study_group_id', type: 'char', length: 36 })
  studyGroupId: string;
  @Column({ name: 'student_id', type: 'char', length: 36 }) studentId: string;
  @CreateDateColumn({ name: 'joined_at', type: 'datetime', precision: 6 })
  joinedAt: Date;
  @ManyToOne(() => TenantEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantEntity;
  @ManyToOne(() => StudyGroupEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'study_group_id' })
  studyGroup: StudyGroupEntity;
  @ManyToOne(() => StudentEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: StudentEntity;
}
