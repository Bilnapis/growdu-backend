import 'dotenv/config';
import mysql from 'mysql2/promise';

const databaseName = `growdu_migration_verify_${process.pid}_${Date.now()}`;
const databaseNamePattern = /^growdu_migration_verify_\d+_\d+$/;

if (
  !databaseNamePattern.test(databaseName) ||
  databaseName === process.env.DB_NAME
) {
  throw new Error('Refusing to use an unsafe disposable database name');
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? '3306', 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD ?? '',
});

let created = false;
let dataSource;

try {
  await connection.query(
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  created = true;
  process.env.DB_NAME = databaseName;

  ({ default: dataSource } = await import('../src/database/data-source.ts'));
  await dataSource.initialize();

  const firstRun = await dataSource.runMigrations();
  if (firstRun.length !== 1) {
    throw new Error('Expected exactly one migration on the first run');
  }

  await dataSource.undoLastMigration();

  const secondRun = await dataSource.runMigrations();
  if (secondRun.length !== 1) {
    throw new Error('Expected exactly one migration after reverting');
  }

  console.log('Migration run -> revert -> run verified successfully.');
} finally {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
  if (created && databaseNamePattern.test(databaseName)) {
    await connection.query(`DROP DATABASE \`${databaseName}\``);
  }
  await connection.end();
}
