import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity } from '../../tenants/entities/tenant.entity.js';
import { TutorEntity } from '../../tutors/entities/tutor.entity.js';
import { StudyGroupEntity } from './study-group.entity.js';

@Entity({ name: 'study_group_schedules' })
@Index('IDX_study_group_schedules_tenant_tutor_day', ['tenantId', 'tutorId', 'dayOfWeek'])
export class StudyGroupScheduleEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'study_group_id', type: 'char', length: 36 }) studyGroupId: string;
  @Column({ name: 'tutor_id', type: 'char', length: 36 }) tutorId: string;
  @Column({ name: 'day_of_week', type: 'tinyint' }) dayOfWeek: number;
  @Column({ name: 'start_time', type: 'time' }) startTime: string;
  @Column({ name: 'end_time', type: 'time' }) endTime: string;
  @Column({ name: 'sort_order', type: 'smallint' }) sortOrder: number;
  @ManyToOne(() => TenantEntity, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant: TenantEntity;
  @ManyToOne(() => StudyGroupEntity, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'study_group_id' }) studyGroup: StudyGroupEntity;
  @ManyToOne(() => TutorEntity, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tutor_id' }) tutor: TutorEntity;
}
