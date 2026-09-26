import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCoreIdentitySchema20260926000000 implements MigrationInterface {
  name = 'CreateCoreIdentitySchema20260926000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tenants (
        id char(36) NOT NULL,
        name varchar(150) NOT NULL,
        address text NULL,
        whatsapp_number varchar(20) NULL,
        email varchar(150) NULL,
        logo_url varchar(500) NULL,
        status enum('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id char(36) NOT NULL,
        tenant_id char(36) NOT NULL,
        email varchar(150) NOT NULL,
        password_hash varchar(255) NOT NULL,
        role enum('owner', 'admin', 'tutor', 'parent') NOT NULL,
        status enum('active', 'inactive') NOT NULL DEFAULT 'active',
        last_login_at datetime(6) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_users_email (email),
        UNIQUE KEY UQ_users_tenant_id_id (tenant_id, id),
        KEY IDX_users_tenant_id_status (tenant_id, status),
        CONSTRAINT FK_users_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE tutors (
        id char(36) NOT NULL,
        tenant_id char(36) NOT NULL,
        user_id char(36) NULL,
        name varchar(150) NOT NULL,
        phone_number varchar(20) NOT NULL,
        session_rate decimal(12,2) NOT NULL,
        status enum('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_tutors_user_id (user_id),
        KEY IDX_tutors_tenant_id_status (tenant_id, status),
        CONSTRAINT FK_tutors_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT FK_tutors_tenant_id_user_id FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE parents (
        id char(36) NOT NULL,
        tenant_id char(36) NOT NULL,
        user_id char(36) NULL,
        name varchar(150) NOT NULL,
        phone_number varchar(20) NOT NULL,
        contact_email varchar(150) NOT NULL,
        status enum('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_parents_user_id (user_id),
        UNIQUE KEY UQ_parents_tenant_id_id (tenant_id, id),
        KEY IDX_parents_tenant_id_status (tenant_id, status),
        CONSTRAINT FK_parents_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT FK_parents_tenant_id_user_id FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE students (
        id char(36) NOT NULL,
        tenant_id char(36) NOT NULL,
        student_code varchar(30) NOT NULL,
        name varchar(150) NOT NULL,
        gender enum('male', 'female') NOT NULL,
        education_level varchar(50) NOT NULL,
        school varchar(150) NOT NULL,
        phone_number varchar(20) NULL,
        address text NOT NULL,
        status enum('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_students_tenant_id_student_code (tenant_id, student_code),
        UNIQUE KEY UQ_students_tenant_id_id (tenant_id, id),
        KEY IDX_students_tenant_id_status (tenant_id, status),
        CONSTRAINT FK_students_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE student_parents (
        tenant_id char(36) NOT NULL,
        student_id char(36) NOT NULL,
        parent_id char(36) NOT NULL,
        relationship enum('father', 'mother', 'guardian') NOT NULL,
        is_primary tinyint(1) NOT NULL DEFAULT 0,
        access_status enum('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (student_id, parent_id),
        KEY IDX_student_parents_tenant_id_parent_id (tenant_id, parent_id),
        CONSTRAINT FK_student_parents_tenant_student FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT FK_student_parents_tenant_parent FOREIGN KEY (tenant_id, parent_id) REFERENCES parents (tenant_id, id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE auth_sessions (
        id char(36) NOT NULL,
        user_id char(36) NOT NULL,
        refresh_token_hash char(64) NOT NULL,
        expires_at datetime(6) NOT NULL,
        revoked_at datetime(6) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_auth_sessions_user_id_revoked_at (user_id, revoked_at),
        KEY IDX_auth_sessions_expires_at (expires_at),
        CONSTRAINT FK_auth_sessions_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE auth_sessions');
    await queryRunner.query('DROP TABLE student_parents');
    await queryRunner.query('DROP TABLE students');
    await queryRunner.query('DROP TABLE parents');
    await queryRunner.query('DROP TABLE tutors');
    await queryRunner.query('DROP TABLE users');
    await queryRunner.query('DROP TABLE tenants');
  }
}
