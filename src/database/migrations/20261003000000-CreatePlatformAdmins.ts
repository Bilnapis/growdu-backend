import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformAdmins20261003000000 implements MigrationInterface {
  name = 'CreatePlatformAdmins20261003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE platform_admins (
        id char(36) NOT NULL,
        email varchar(150) NOT NULL,
        password_hash varchar(255) NOT NULL,
        status enum('active', 'inactive') NOT NULL DEFAULT 'active',
        last_login_at datetime(6) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_platform_admins_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE platform_admin_sessions (
        id char(36) NOT NULL,
        platform_admin_id char(36) NOT NULL,
        refresh_token_hash char(64) NOT NULL,
        expires_at datetime(6) NOT NULL,
        revoked_at datetime(6) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_platform_admin_sessions_admin_id_revoked_at (platform_admin_id, revoked_at),
        KEY IDX_platform_admin_sessions_expires_at (expires_at),
        CONSTRAINT FK_platform_admin_sessions_admin_id
          FOREIGN KEY (platform_admin_id) REFERENCES platform_admins (id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE platform_admin_sessions');
    await queryRunner.query('DROP TABLE platform_admins');
  }
}
