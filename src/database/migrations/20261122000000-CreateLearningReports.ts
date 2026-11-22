import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLearningReports20261122000000 implements MigrationInterface {
  name = 'CreateLearningReports20261122000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE study_groups ADD UNIQUE KEY UQ_groups_report_tenant (tenant_id,id)',
    );
    await q.query(
      'CREATE TABLE learning_reports (id char(36) PRIMARY KEY, tenant_id char(36) NOT NULL, study_group_id char(36) NOT NULL, period char(7) NOT NULL, tutor_id char(36) NOT NULL, draft_revision_id char(36) NULL, published_revision_id char(36) NULL, version int unsigned NOT NULL DEFAULT 1, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE KEY UQ_learning_report_scope (tenant_id,study_group_id,period,tutor_id), KEY IDX_report_period (tenant_id,period), FOREIGN KEY (tenant_id,study_group_id) REFERENCES study_groups(tenant_id,id) ON DELETE RESTRICT, FOREIGN KEY (tenant_id,tutor_id) REFERENCES tutors(tenant_id,id) ON DELETE RESTRICT)',
    );
    await q.query(
      'CREATE TABLE learning_report_revisions (id char(36) PRIMARY KEY, report_id char(36) NOT NULL, number int unsigned NOT NULL, content json NOT NULL, snapshot json NULL, published_at datetime(6) NULL, UNIQUE KEY UQ_learning_report_revision (report_id,number), UNIQUE KEY UQ_revision_report (id,report_id), FOREIGN KEY (report_id) REFERENCES learning_reports(id) ON DELETE RESTRICT)',
    );
    await q.query(
      'ALTER TABLE learning_reports ADD CONSTRAINT FK_report_draft FOREIGN KEY (draft_revision_id,id) REFERENCES learning_report_revisions(id,report_id) ON DELETE RESTRICT, ADD CONSTRAINT FK_report_published FOREIGN KEY (published_revision_id,id) REFERENCES learning_report_revisions(id,report_id) ON DELETE RESTRICT',
    );
    await q.query(
      'CREATE TABLE learning_report_student_notes (id char(36) PRIMARY KEY, revision_id char(36) NOT NULL, student_id char(36) NOT NULL, note text NOT NULL, UNIQUE KEY UQ_learning_report_note (revision_id,student_id), FOREIGN KEY (revision_id) REFERENCES learning_report_revisions(id) ON DELETE RESTRICT, FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT)',
    );
    await q.query(
      'CREATE TABLE learning_report_events (id char(36) PRIMARY KEY, report_id char(36) NOT NULL, actor_id char(36) NULL, action varchar(30) NOT NULL, details json NOT NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), KEY IDX_report_event (report_id,created_at), FOREIGN KEY (report_id) REFERENCES learning_reports(id) ON DELETE RESTRICT, FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL)',
    );
    await q.query(
      'CREATE TABLE learning_report_settings (tenant_id char(36) PRIMARY KEY, enabled boolean NOT NULL DEFAULT TRUE, generation_day tinyint unsigned NOT NULL DEFAULT 1, next_run_date date NOT NULL, last_run_at datetime(6) NULL, version int unsigned NOT NULL DEFAULT 1, FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT, CONSTRAINT CHK_report_generation_day CHECK (generation_day BETWEEN 1 AND 31))',
    );
    await q.query(
      'CREATE TABLE learning_report_generations (tenant_id char(36) NOT NULL, period char(7) NOT NULL, created int unsigned NOT NULL, skipped int unsigned NOT NULL, processed_at datetime(6) NOT NULL, automatic_at datetime(6) NULL, PRIMARY KEY (tenant_id,period), FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT)',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE learning_report_generations');
    await q.query('DROP TABLE learning_report_settings');
    await q.query('DROP TABLE learning_report_events');
    await q.query('DROP TABLE learning_report_student_notes');
    await q.query(
      'ALTER TABLE learning_reports DROP FOREIGN KEY FK_report_draft, DROP FOREIGN KEY FK_report_published',
    );
    await q.query('DROP TABLE learning_report_revisions');
    await q.query('DROP TABLE learning_reports');
    await q.query(
      'ALTER TABLE study_groups DROP INDEX UQ_groups_report_tenant',
    );
  }
}
