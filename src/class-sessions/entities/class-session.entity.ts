import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('class_sessions')
@Index(['tenantId', 'sessionDate'])
export class ClassSessionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'char', length: 36 }) tenantId: string;
  @Column({ name: 'study_group_id', type: 'char', length: 36 })
  studyGroupId: string;
  @Column({ name: 'configuration_id', type: 'char', length: 36 })
  configurationId: string;
  @Column({ name: 'schedule_rule_id', type: 'char', length: 36 })
  scheduleRuleId: string;
  @Column({ name: 'session_date', type: 'date' }) sessionDate: string;
  @Column({ name: 'occurrence_date', type: 'date' }) occurrenceDate: string;
  @Column({ name: 'series_id', type: 'char', length: 36 }) seriesId: string;
  @Column({ name: 'start_time', type: 'time' }) startTime: string;
  @Column({ name: 'end_time', type: 'time' }) endTime: string;
  @Column({ name: 'tutor_id', type: 'char', length: 36 }) tutorId: string;
  @Column({ name: 'room_id', type: 'char', length: 36, nullable: true })
  roomId: string | null;
  @Column({ name: 'study_group_name', length: 150 }) studyGroupName: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) subject:
    string | null;
  @Column({ type: 'varchar', length: 20, default: 'scheduled' }) status:
    'scheduled' | 'completed' | 'cancelled';
  @Column({ type: 'text', nullable: true }) topic: string | null;
  @Column({ name: 'tutor_note', type: 'text', nullable: true }) tutorNote:
    string | null;
  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;
  @Column({ name: 'completed_by', type: 'char', length: 36, nullable: true })
  completedBy: string | null;
  @Column({ name: 'locked_at', type: 'datetime', nullable: true })
  lockedAt: Date | null;
  @Column({ name: 'lock_reason', type: 'varchar', length: 255, nullable: true })
  lockReason: string | null;
  @Column({ type: 'int', default: 1 }) version: number;
}
