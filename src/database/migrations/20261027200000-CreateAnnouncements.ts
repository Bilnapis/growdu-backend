import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnnouncements20261027200000 implements MigrationInterface {
  name = 'CreateAnnouncements20261027200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE announcements (
      id char(36) NOT NULL,
      tenant_id char(36) NOT NULL,
      title varchar(150) NOT NULL,
      content text NOT NULL,
      target_role enum('all','admin','tutor','parent') NOT NULL,
      starts_at char(24) NULL COMMENT 'ISO 8601 canonical UTC',
      ends_at char(24) NULL COMMENT 'ISO 8601 canonical UTC',
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      KEY IDX_announcements_tenant_target_start_end (tenant_id, target_role, starts_at, ends_at),
      KEY IDX_announcements_tenant_created (tenant_id, created_at),
      CONSTRAINT FK_announcements_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
      CONSTRAINT CHK_announcements_dates CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at > starts_at))
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE announcements');
  }
}
