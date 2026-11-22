import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { ReportContent, ReportSnapshot } from '../report-types.js';

@Entity('learning_reports')
@Index(
  'UQ_learning_report_scope',
  ['tenantId', 'studyGroupId', 'period', 'tutorId'],
  { unique: true },
)
export class LearningReportEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'study_group_id', type: 'char', length: 36 })
  studyGroupId: string;
  @Column({ type: 'char', length: 7 }) period: string;
  @Column({ name: 'tutor_id', type: 'char', length: 36 }) tutorId: string;
  @Column({
    name: 'draft_revision_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  draftRevisionId: string | null;
  @Column({
    name: 'published_revision_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  publishedRevisionId: string | null;
  @Column({ type: 'int', unsigned: true, default: 1 }) version: number;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
@Entity('learning_report_revisions')
@Index('UQ_learning_report_revision', ['reportId', 'number'], { unique: true })
export class LearningReportRevisionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'report_id', type: 'char', length: 36 }) reportId: string;
  @Column({ type: 'int', unsigned: true }) number: number;
  @Column({ type: 'json' }) content: ReportContent;
  @Column({ type: 'json', nullable: true }) snapshot: ReportSnapshot | null;
  @Column({
    name: 'published_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  publishedAt: Date | null;
}
@Entity('learning_report_student_notes')
@Index('UQ_learning_report_note', ['revisionId', 'studentId'], { unique: true })
export class LearningReportStudentNoteEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'revision_id', type: 'char', length: 36 }) revisionId: string;
  @Column({ name: 'student_id', type: 'char', length: 36 }) studentId: string;
  @Column({ type: 'text' }) note: string;
}
@Entity('learning_report_events')
@Index(['reportId', 'createdAt'])
export class LearningReportEventEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'report_id', type: 'char', length: 36 }) reportId: string;
  @Column({ name: 'actor_id', type: 'char', length: 36, nullable: true })
  actorId: string | null;
  @Column({ length: 30 }) action: string;
  @Column({ type: 'json' }) details: { reason?: string; revision: number };
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
@Entity('learning_report_settings')
export class LearningReportSettingsEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;
  @Column({ type: 'boolean', default: true }) enabled: boolean;
  @Column({
    name: 'generation_day',
    type: 'tinyint',
    unsigned: true,
    default: 1,
  })
  generationDay: number;
  @Column({ name: 'next_run_date', type: 'date' }) nextRunDate: string;
  @Column({
    name: 'last_run_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastRunAt: Date | null;
  @Column({ type: 'int', unsigned: true, default: 1 }) version: number;
}
@Entity('learning_report_generations')
export class LearningReportGenerationEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId: string;
  @PrimaryColumn({ type: 'char', length: 7 }) period: string;
  @Column({ type: 'int', unsigned: true }) created: number;
  @Column({ type: 'int', unsigned: true }) skipped: number;
  @Column({ name: 'processed_at', type: 'datetime', precision: 6 })
  processedAt: Date;
  @Column({
    name: 'automatic_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  automaticAt: Date | null;
}
