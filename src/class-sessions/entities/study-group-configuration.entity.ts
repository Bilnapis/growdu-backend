import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
@Entity('study_group_configurations')
export class StudyGroupConfigurationEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'study_group_id', type: 'char', length: 36 })
  studyGroupId: string;
  @Column({ name: 'effective_from', type: 'date' }) effectiveFrom: string;
  @Column({ name: 'effective_until', type: 'date' }) effectiveUntil: string;
  @Column({ name: 'supersedes_id', type: 'char', length: 36, nullable: true })
  supersedesId: string | null;
  @Column({ name: 'created_by', type: 'char', length: 36, nullable: true })
  createdBy: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @Column({ name: 'superseded_at', type: 'datetime', nullable: true })
  supersededAt: Date | null;
}
