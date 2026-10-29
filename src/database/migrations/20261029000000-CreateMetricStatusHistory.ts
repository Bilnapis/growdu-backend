import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMetricStatusHistory20261029000000 implements MigrationInterface {
  name = 'CreateMetricStatusHistory20261029000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE metric_history_state (
        id tinyint unsigned NOT NULL,
        started_at datetime(6) NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE metric_status_history (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        tenant_id char(36) NOT NULL,
        entity_type enum('student', 'tutor') NOT NULL,
        entity_id char(36) NOT NULL,
        status enum('active', 'inactive') NOT NULL,
        recorded_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_metric_status_history_entity (tenant_id, entity_type, entity_id, recorded_at),
        CONSTRAINT FK_metric_status_history_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants (id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const [table, entityType] of [
      ['students', 'student'],
      ['tutors', 'tutor'],
    ]) {
      // Database triggers also cover AdminJS and writes outside the REST API.
      // History inserts participate in the same transaction as the source write.
      await queryRunner.query(`
        CREATE TRIGGER ${table}_metric_history_insert AFTER INSERT ON ${table}
        FOR EACH ROW
          INSERT INTO metric_status_history (tenant_id, entity_type, entity_id, status)
          VALUES (NEW.tenant_id, '${entityType}', NEW.id, NEW.status)
      `);
      await queryRunner.query(`
        CREATE TRIGGER ${table}_metric_history_update AFTER UPDATE ON ${table}
        FOR EACH ROW BEGIN
          IF OLD.tenant_id <> NEW.tenant_id THEN
            INSERT INTO metric_status_history (tenant_id, entity_type, entity_id, status)
            VALUES (OLD.tenant_id, '${entityType}', OLD.id, 'inactive');
            INSERT INTO metric_status_history (tenant_id, entity_type, entity_id, status)
            VALUES (NEW.tenant_id, '${entityType}', NEW.id, NEW.status);
          ELSEIF OLD.status <> NEW.status THEN
            INSERT INTO metric_status_history (tenant_id, entity_type, entity_id, status)
            VALUES (NEW.tenant_id, '${entityType}', NEW.id, NEW.status);
          END IF;
        END
      `);
      await queryRunner.query(`
        CREATE TRIGGER ${table}_metric_history_delete AFTER DELETE ON ${table}
        FOR EACH ROW
          INSERT INTO metric_status_history (tenant_id, entity_type, entity_id, status)
          VALUES (OLD.tenant_id, '${entityType}', OLD.id, 'inactive')
      `);
      await queryRunner.query(`
        INSERT INTO metric_status_history (tenant_id, entity_type, entity_id, status)
        SELECT source.tenant_id, '${entityType}', source.id, source.status FROM ${table} source
        WHERE NOT EXISTS (
          SELECT 1 FROM metric_status_history history
          WHERE history.tenant_id = source.tenant_id
            AND history.entity_type = '${entityType}' AND history.entity_id = source.id
        )
      `);
    }

    await queryRunner.query(
      'INSERT INTO metric_history_state (id, started_at) VALUES (1, CURRENT_TIMESTAMP(6))',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['students', 'tutors']) {
      for (const action of ['insert', 'update', 'delete']) {
        await queryRunner.query(
          `DROP TRIGGER ${table}_metric_history_${action}`,
        );
      }
    }
    await queryRunner.query('DROP TABLE metric_status_history');
    await queryRunner.query('DROP TABLE metric_history_state');
  }
}
