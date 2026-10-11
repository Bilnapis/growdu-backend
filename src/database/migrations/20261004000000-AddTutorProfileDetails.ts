import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTutorProfileDetails20261004000000
  implements MigrationInterface
{
  name = 'AddTutorProfileDetails20261004000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tutors
        ADD email varchar(150) NULL AFTER phone_number,
        ADD address text NULL AFTER email,
        ADD expertise varchar(100) NULL AFTER address,
        ADD education varchar(150) NULL AFTER expertise,
        ADD bank_name varchar(100) NULL AFTER education,
        ADD account_name varchar(150) NULL AFTER bank_name,
        ADD account_number varchar(50) NULL AFTER account_name
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tutors
        DROP COLUMN account_number,
        DROP COLUMN account_name,
        DROP COLUMN bank_name,
        DROP COLUMN education,
        DROP COLUMN expertise,
        DROP COLUMN address,
        DROP COLUMN email
    `);
  }
}
