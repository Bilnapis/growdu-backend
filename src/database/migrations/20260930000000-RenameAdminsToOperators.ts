import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameAdminsToOperators20260930000000 implements MigrationInterface {
  name = 'RenameAdminsToOperators20260930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE admins RENAME TO operators');
    await queryRunner.query(`
      ALTER TABLE users
      MODIFY role enum('owner', 'admin', 'operator', 'tutor', 'parent') NOT NULL
    `);
    await queryRunner.query(
      "UPDATE users SET role = 'operator' WHERE role = 'admin'",
    );
    await queryRunner.query(`
      ALTER TABLE users
      MODIFY role enum('owner', 'operator', 'tutor', 'parent') NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      MODIFY role enum('owner', 'admin', 'operator', 'tutor', 'parent') NOT NULL
    `);
    await queryRunner.query(
      "UPDATE users SET role = 'admin' WHERE role = 'operator'",
    );
    await queryRunner.query(`
      ALTER TABLE users
      MODIFY role enum('owner', 'admin', 'tutor', 'parent') NOT NULL
    `);
    await queryRunner.query('ALTER TABLE operators RENAME TO admins');
  }
}
