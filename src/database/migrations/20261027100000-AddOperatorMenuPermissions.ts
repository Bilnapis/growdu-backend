import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorMenuPermissions20261027100000
  implements MigrationInterface
{
  name = 'AddOperatorMenuPermissions20261027100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE operators ADD menu_permissions json NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE operators DROP COLUMN menu_permissions');
  }
}
