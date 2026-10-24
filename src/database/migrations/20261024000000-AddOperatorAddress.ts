import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorAddress20261024000000 implements MigrationInterface {
  name = 'AddOperatorAddress20261024000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE operators ADD address varchar(1000) NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE operators DROP COLUMN address');
  }
}
