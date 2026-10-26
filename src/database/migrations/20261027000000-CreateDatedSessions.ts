import { randomUUID } from 'node:crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  jakartaDate,
  legacyEndDate,
  sessionDates,
} from '../../class-sessions/session-dates.js';

export class CreateDatedSessions20261027000000 implements MigrationInterface {
  name = 'CreateDatedSessions20261027000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE study_group_configurations (
   id char(36) PRIMARY KEY, tenant_id char(36) NOT NULL, study_group_id char(36) NOT NULL,
   effective_from date NOT NULL, effective_until date NOT NULL, supersedes_id char(36) NULL, created_by char(36) NULL,
   created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), superseded_at datetime NULL,
   KEY IDX_configuration_group_dates (tenant_id,study_group_id,effective_from,effective_until),
   FOREIGN KEY (study_group_id) REFERENCES study_groups(id) ON DELETE RESTRICT,
   FOREIGN KEY (supersedes_id) REFERENCES study_group_configurations(id) ON DELETE RESTRICT,
   FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT)`);
    await q.query(
      'ALTER TABLE study_group_schedules ADD configuration_id char(36) NULL, ADD INDEX IDX_rule_configuration (configuration_id), ADD CONSTRAINT FK_rule_configuration FOREIGN KEY (configuration_id) REFERENCES study_group_configurations(id) ON DELETE RESTRICT',
    );
    await q.query(
      'ALTER TABLE study_group_schedules ADD series_id char(36) NULL',
    );
    await q.query('UPDATE study_group_schedules SET series_id=id');
    await q.query(
      'ALTER TABLE study_group_schedules MODIFY series_id char(36) NOT NULL',
    );
    await q.query(
      'ALTER TABLE study_group_students ADD id char(36) NULL, ADD configuration_id char(36) NULL',
    );
    await q.query('UPDATE study_group_students SET id = UUID()');
    await q.query(
      'ALTER TABLE study_group_students MODIFY id char(36) NOT NULL, DROP PRIMARY KEY, ADD PRIMARY KEY (id), ADD UNIQUE KEY UQ_configuration_student (configuration_id, student_id), ADD CONSTRAINT FK_member_configuration FOREIGN KEY (configuration_id) REFERENCES study_group_configurations(id) ON DELETE RESTRICT',
    );
    await q.query(`CREATE TABLE class_sessions (
   id char(36) PRIMARY KEY, tenant_id char(36) NOT NULL, study_group_id char(36) NOT NULL,
   configuration_id char(36) NOT NULL, schedule_rule_id char(36) NOT NULL,
   session_date date NOT NULL, occurrence_date date NOT NULL, series_id char(36) NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
   tutor_id char(36) NOT NULL, room_id char(36) NULL, study_group_name varchar(150) NOT NULL, subject varchar(255) NULL,
   status varchar(20) NOT NULL DEFAULT 'scheduled', topic text NULL, tutor_note text NULL,
   completed_at datetime NULL, completed_by char(36) NULL, locked_at datetime NULL, lock_reason varchar(255) NULL, version int NOT NULL DEFAULT 1,
   KEY IDX_session_tenant_date (tenant_id,session_date), KEY IDX_session_tutor_date (tenant_id,tutor_id,session_date),
   KEY IDX_session_group_date (tenant_id,study_group_id,session_date), KEY IDX_session_room_date (tenant_id,room_id,session_date),
   KEY IDX_session_status (tenant_id,status,session_date),
   UNIQUE KEY UQ_session_occurrence (series_id,occurrence_date),
   FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
   FOREIGN KEY (study_group_id) REFERENCES study_groups(id) ON DELETE RESTRICT,
   FOREIGN KEY (configuration_id) REFERENCES study_group_configurations(id) ON DELETE RESTRICT,
   FOREIGN KEY (schedule_rule_id) REFERENCES study_group_schedules(id) ON DELETE RESTRICT,
   FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE RESTRICT,
   FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE class_session_students (
   id char(36) PRIMARY KEY, session_id char(36) NOT NULL, student_id char(36) NOT NULL,
   name varchar(150) NOT NULL, school varchar(150) NOT NULL, education_level varchar(50) NOT NULL,
   status varchar(20) NULL, note text NULL, UNIQUE KEY UQ_session_student (session_id,student_id),
   FOREIGN KEY (session_id) REFERENCES class_sessions(id) ON DELETE CASCADE,
   FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE class_session_audits (
   id char(36) PRIMARY KEY, session_id char(36) NOT NULL, actor_id char(36) NULL,
   action varchar(40) NOT NULL, reason varchar(1000) NULL, before_data json NULL, after_data json NOT NULL,
   created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), KEY IDX_session_audit (session_id,created_at),
   FOREIGN KEY (session_id) REFERENCES class_sessions(id) ON DELETE RESTRICT)`);
    const from = jakartaDate();
    const until = legacyEndDate(from);
    const groups: {
      id: string;
      tenant_id: string;
      name: string;
      status: string;
    }[] = await q.query('SELECT id,tenant_id,name,status FROM study_groups');
    for (const group of groups) {
      const configuration = randomUUID();
      await q.query(
        'INSERT INTO study_group_configurations (id,tenant_id,study_group_id,effective_from,effective_until) VALUES (?,?,?,?,?)',
        [configuration, group.tenant_id, group.id, from, until],
      );
      await q.query(
        'UPDATE study_group_schedules SET configuration_id=? WHERE study_group_id=?',
        [configuration, group.id],
      );
      await q.query(
        'UPDATE study_group_students SET configuration_id=? WHERE study_group_id=?',
        [configuration, group.id],
      );
      if (group.status !== 'active') continue;
      const rules: {
        id: string;
        tutor_id: string;
        room_id: string | null;
        day_of_week: number;
        start_time: string;
        end_time: string;
        expertise: string | null;
      }[] = await q.query(
        'SELECT s.id,s.tutor_id,s.room_id,s.day_of_week,s.start_time,s.end_time,t.expertise FROM study_group_schedules s JOIN tutors t ON t.id=s.tutor_id WHERE s.study_group_id=?',
        [group.id],
      );
      for (const rule of rules)
        for (const date of sessionDates(from, until, rule.day_of_week)) {
          const id = randomUUID();
          await q.query(
            'INSERT INTO class_sessions (id,tenant_id,study_group_id,configuration_id,schedule_rule_id,session_date,occurrence_date,series_id,start_time,end_time,tutor_id,room_id,study_group_name,subject) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
              id,
              group.tenant_id,
              group.id,
              configuration,
              rule.id,
              date,
              date,
              rule.id,
              rule.start_time,
              rule.end_time,
              rule.tutor_id,
              rule.room_id,
              group.name,
              rule.expertise,
            ],
          );
          await q.query(
            'INSERT INTO class_session_students (id,session_id,student_id,name,school,education_level) SELECT UUID(),?,s.id,s.name,s.school,s.education_level FROM study_group_students m JOIN students s ON s.id=m.student_id WHERE m.configuration_id=?',
            [id, configuration],
          );
        }
    }
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: { total: string }[] = await q.query(
      'SELECT COUNT(*) total FROM class_session_audits',
    );
    if (Number(rows[0]?.total))
      throw new Error(
        'Rollback refused: session records have been changed. Export and restore a backup instead.',
      );
    const revisions: { total: string }[] = await q.query(
      'SELECT COUNT(*) total FROM study_group_configurations WHERE supersedes_id IS NOT NULL',
    );
    if (Number(revisions[0]?.total))
      throw new Error(
        'Rollback refused: dated configuration history exists. Export and restore a backup instead.',
      );
    await q.query('DROP TABLE class_session_audits');
    await q.query('DROP TABLE class_session_students');
    await q.query('DROP TABLE class_sessions');
    // Keep only the most recent configuration when restoring the legacy projection.
    await q.query(
      'DELETE m FROM study_group_students m JOIN study_group_configurations c ON c.id=m.configuration_id WHERE EXISTS (SELECT 1 FROM study_group_configurations n WHERE n.study_group_id=c.study_group_id AND (n.effective_from>c.effective_from OR (n.effective_from=c.effective_from AND n.created_at>c.created_at)))',
    );
    await q.query(
      'DELETE s FROM study_group_schedules s JOIN study_group_configurations c ON c.id=s.configuration_id WHERE EXISTS (SELECT 1 FROM study_group_configurations n WHERE n.study_group_id=c.study_group_id AND (n.effective_from>c.effective_from OR (n.effective_from=c.effective_from AND n.created_at>c.created_at)))',
    );
    await q.query(
      'ALTER TABLE study_group_students DROP FOREIGN KEY FK_member_configuration, DROP INDEX UQ_configuration_student, DROP PRIMARY KEY, ADD PRIMARY KEY (tenant_id,study_group_id,student_id), DROP COLUMN id, DROP COLUMN configuration_id',
    );
    await q.query(
      'ALTER TABLE study_group_schedules DROP FOREIGN KEY FK_rule_configuration, DROP INDEX IDX_rule_configuration, DROP COLUMN configuration_id, DROP COLUMN series_id',
    );
    await q.query('DROP TABLE study_group_configurations');
  }
}
