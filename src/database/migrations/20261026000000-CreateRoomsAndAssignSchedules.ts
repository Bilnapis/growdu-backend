import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoomsAndAssignSchedules20261026000000 implements MigrationInterface {
  name = 'CreateRoomsAndAssignSchedules20261026000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE rooms (id char(36) NOT NULL, tenant_id char(36) NOT NULL, name varchar(150) NOT NULL, code varchar(30) NOT NULL, capacity smallint unsigned NOT NULL, status enum('active','inactive') NOT NULL DEFAULT 'active', created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (id), UNIQUE KEY UQ_rooms_tenant_code (tenant_id, code), KEY IDX_rooms_tenant_status_capacity (tenant_id, status, capacity), CONSTRAINT FK_rooms_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT)`,
    );
    await queryRunner.query(
      'ALTER TABLE study_group_schedules ADD room_id char(36) NULL AFTER tutor_id',
    );
    await queryRunner.query(
      'CREATE INDEX IDX_study_group_schedules_tenant_room_day ON study_group_schedules (tenant_id, room_id, day_of_week)',
    );
    await queryRunner.query(
      'ALTER TABLE study_group_schedules ADD CONSTRAINT FK_study_group_schedules_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE study_group_schedules DROP FOREIGN KEY FK_study_group_schedules_room',
    );
    await queryRunner.query(
      'DROP INDEX IDX_study_group_schedules_tenant_room_day ON study_group_schedules',
    );
    await queryRunner.query(
      'ALTER TABLE study_group_schedules DROP COLUMN room_id',
    );
    await queryRunner.query('DROP TABLE rooms');
  }
}
