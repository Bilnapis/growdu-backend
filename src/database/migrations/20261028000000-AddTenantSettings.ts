import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantSettings20261028000000 implements MigrationInterface {
  name = 'AddTenantSettings20261028000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `tenants` ADD `website_url` varchar(500) NULL, ADD `primary_color` char(7) NOT NULL DEFAULT '#1F8FE5'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `tenants` DROP COLUMN `primary_color`, DROP COLUMN `website_url`',
    );
  }
}
