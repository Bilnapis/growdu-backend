import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnerAndAdminProfiles20260929000000 implements MigrationInterface {
  name = 'AddOwnerAndAdminProfiles20260929000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const usersTenantId = await this.findColumn(
      queryRunner,
      'users',
      'tenant_id',
    );
    if (usersTenantId?.IS_NULLABLE === 'NO') {
      await queryRunner.query(
        'ALTER TABLE users MODIFY tenant_id char(36) NULL',
      );
    }

    if (!(await queryRunner.hasTable('owners'))) {
      await queryRunner.query(`
        CREATE TABLE owners (
          id char(36) NOT NULL,
          user_id char(36) NOT NULL,
          name varchar(150) NOT NULL,
          phone_number varchar(20) NOT NULL,
          status enum('active', 'inactive') NOT NULL DEFAULT 'active',
          created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY UQ_owners_user_id (user_id),
          CONSTRAINT FK_owners_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await queryRunner.hasColumn('tenants', 'owner_id'))) {
      await queryRunner.query(
        'ALTER TABLE tenants ADD owner_id char(36) NOT NULL AFTER id',
      );
    }
    if (
      !(await this.indexExists(queryRunner, 'tenants', 'IDX_tenants_owner_id'))
    ) {
      await queryRunner.query(
        'ALTER TABLE tenants ADD KEY IDX_tenants_owner_id (owner_id)',
      );
    }
    if (
      !(await this.foreignKeyExists(
        queryRunner,
        'tenants',
        'FK_tenants_owner_id',
      ))
    ) {
      await queryRunner.query(`
        ALTER TABLE tenants
        ADD CONSTRAINT FK_tenants_owner_id
        FOREIGN KEY (owner_id) REFERENCES owners (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
      `);
    }

    if (!(await queryRunner.hasTable('admins'))) {
      await queryRunner.query(`
        CREATE TABLE admins (
          id char(36) NOT NULL,
          tenant_id char(36) NOT NULL,
          user_id char(36) NOT NULL,
          name varchar(150) NOT NULL,
          phone_number varchar(20) NOT NULL,
          status enum('active', 'inactive') NOT NULL DEFAULT 'active',
          created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY UQ_admins_user_id (user_id),
          KEY IDX_admins_tenant_id_status (tenant_id, status),
          CONSTRAINT FK_admins_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT FK_admins_tenant_id_user_id FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE admins');
    await queryRunner.query(
      'ALTER TABLE tenants DROP FOREIGN KEY FK_tenants_owner_id',
    );
    await queryRunner.query(
      'ALTER TABLE tenants DROP KEY IDX_tenants_owner_id',
    );
    await queryRunner.query('ALTER TABLE tenants DROP COLUMN owner_id');
    await queryRunner.query('DROP TABLE owners');
    await queryRunner.query(
      'ALTER TABLE users MODIFY tenant_id char(36) NOT NULL',
    );
  }

  private async findColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<{ IS_NULLABLE: 'YES' | 'NO' } | null> {
    const columns = (await queryRunner.query(
      `
        SELECT IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
      `,
      [tableName, columnName],
    )) as Array<{ IS_NULLABLE: 'YES' | 'NO' }>;
    return columns[0] ?? null;
  }

  private async indexExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
  ): Promise<boolean> {
    const indexes = (await queryRunner.query(
      `
        SELECT 1
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND INDEX_NAME = ?
        LIMIT 1
      `,
      [tableName, indexName],
    )) as unknown[];
    return indexes.length > 0;
  }

  private async foreignKeyExists(
    queryRunner: QueryRunner,
    tableName: string,
    foreignKeyName: string,
  ): Promise<boolean> {
    const foreignKeys = (await queryRunner.query(
      `
        SELECT 1
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND CONSTRAINT_NAME = ?
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        LIMIT 1
      `,
      [tableName, foreignKeyName],
    )) as unknown[];
    return foreignKeys.length > 0;
  }
}
