import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const databaseName = `growdu_metric_verify_${process.pid}_${Date.now()}`;
const databasePattern = /^growdu_metric_verify_\d+_\d+$/;
if (
  !databasePattern.test(databaseName) ||
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
  const migrations = await dataSource.runMigrations();
  assert.equal(
    migrations.at(-1).name,
    'CreateMetricStatusHistory20261029000000',
  );
  await dataSource.undoLastMigration();

  const [user, owner, tenant, student, tutor] = Array.from({ length: 5 }, () =>
    randomUUID(),
  );
  await dataSource.query(
    "INSERT INTO users (id,email,password_hash,role) VALUES (?,?,'fixture-only','owner')",
    [user, 'metric-migration@example.invalid'],
  );
  await dataSource.query(
    "INSERT INTO owners (id,user_id,name,phone_number) VALUES (?,?,'Fixture owner','0800000000')",
    [owner, user],
  );
  await dataSource.query(
    "INSERT INTO tenants (id,owner_id,name) VALUES (?,?,'Fixture tenant')",
    [tenant, owner],
  );
  await dataSource.query(
    "INSERT INTO students (id,tenant_id,student_code,name,gender,education_level,school,address) VALUES (?,?,'METRIC-1','Fixture student','female','SMP','Fixture school','Jakarta')",
    [student, tenant],
  );
  await dataSource.query(
    "INSERT INTO tutors (id,tenant_id,name,phone_number,session_rate,status) VALUES (?,?,'Fixture tutor','0800000001',0,'inactive')",
    [tutor, tenant],
  );

  assert.equal((await dataSource.runMigrations()).length, 1);
  const historyCount = async () =>
    Number(
      (
        await dataSource.query(
          'SELECT COUNT(*) total FROM metric_status_history WHERE tenant_id=?',
          [tenant],
        )
      )[0].total,
    );
  assert.equal(await historyCount(), 2);
  const states = await dataSource.query(
    'SELECT started_at FROM metric_history_state WHERE id=1',
  );
  assert.equal(states.length, 1);
  assert.ok(states[0].started_at instanceof Date);

  await dataSource.query("UPDATE students SET status='inactive' WHERE id=?", [
    student,
  ]);
  assert.equal(await historyCount(), 3);
  await dataSource.query(
    "UPDATE students SET name='Renamed fixture' WHERE id=?",
    [student],
  );
  assert.equal(await historyCount(), 3);
  await assert.rejects(
    dataSource.transaction(async (manager) => {
      await manager.query("UPDATE tutors SET status='active' WHERE id=?", [
        tutor,
      ]);
      throw new Error('fixture rollback');
    }),
    /fixture rollback/,
  );
  assert.equal(await historyCount(), 3);
  await dataSource.query("UPDATE tutors SET status='active' WHERE id=?", [
    tutor,
  ]);
  assert.equal(await historyCount(), 4);

  await dataSource.undoLastMigration();
  const triggers = await dataSource.query(
    "SELECT TRIGGER_NAME FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA=? AND TRIGGER_NAME LIKE '%_metric_history_%'",
    [databaseName],
  );
  assert.equal(triggers.length, 0);
  assert.equal(
    (
      await dataSource.query('SELECT status FROM students WHERE id=?', [
        student,
      ])
    )[0].status,
    'inactive',
  );
  assert.equal(
    (await dataSource.query('SELECT status FROM tutors WHERE id=?', [tutor]))[0]
      .status,
    'active',
  );
  await dataSource.runMigrations();
  assert.equal(await historyCount(), 2);
  console.log(
    'PASS: migration run/revert/run, legacy snapshots, transactional triggers, and source data preservation.',
  );
} finally {
  if (dataSource?.isInitialized) await dataSource.destroy();
  if (created && databasePattern.test(databaseName))
    await connection.query(`DROP DATABASE \`${databaseName}\``);
  await connection.end();
}
