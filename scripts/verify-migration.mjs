import 'dotenv/config';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

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
  const expectedMigrationCount = dataSource.migrations.length;
  if (firstRun.length !== expectedMigrationCount) {
    throw new Error(
      `Expected ${expectedMigrationCount} migrations on the first run, received ${firstRun.length}`,
    );
  }

  await dataSource.undoLastMigration();

  // Seed actual legacy rows before re-running the new migration.
  const [user, owner, tenant, tutor, student, group, rule] = Array.from(
    { length: 7 },
    () => randomUUID(),
  );
  await dataSource.query(
    "INSERT INTO users (id,email,password_hash,role) VALUES (?,?,'fixture-only','owner')",
    [user, 'migration-fixture@example.invalid'],
  );
  await dataSource.query(
    "INSERT INTO owners (id,user_id,name,phone_number) VALUES (?,?,'Migration owner','0800000000')",
    [owner, user],
  );
  await dataSource.query(
    "INSERT INTO tenants (id,owner_id,name) VALUES (?,?,'Migration tenant')",
    [tenant, owner],
  );
  await dataSource.query(
    "INSERT INTO tutors (id,tenant_id,name,phone_number,session_rate) VALUES (?,?,'Migration tutor','0800000001',0)",
    [tutor, tenant],
  );
  await dataSource.query(
    "INSERT INTO students (id,tenant_id,student_code,name,gender,education_level,school,address) VALUES (?,?,'LEGACY-1','Snapshot Student','female','SMP','Legacy School','Jakarta')",
    [student, tenant],
  );
  await dataSource.query(
    "INSERT INTO study_groups (id,tenant_id,name) VALUES (?,?,'Legacy group')",
    [group, tenant],
  );
  await dataSource.query(
    "INSERT INTO study_group_schedules (id,tenant_id,study_group_id,tutor_id,day_of_week,start_time,end_time,sort_order) VALUES (?,?,?,?,2,'15:00','16:00',0)",
    [rule, tenant, group, tutor],
  );
  await dataSource.query(
    'INSERT INTO study_group_students (tenant_id,study_group_id,student_id) VALUES (?,?,?)',
    [tenant, group, student],
  );

  const secondRun = await dataSource.runMigrations();
  if (secondRun.length !== 1) {
    throw new Error('Expected exactly one migration after reverting');
  }
  const { jakartaDate, legacyEndDate, sessionDates } =
    await import('../src/class-sessions/session-dates.ts');
  const from = jakartaDate();
  const expected = sessionDates(from, legacyEndDate(from), 2);
  const sessions = await dataSource.query(
    'SELECT id,DATE_FORMAT(session_date,"%Y-%m-%d") date FROM class_sessions WHERE study_group_id=? ORDER BY session_date',
    [group],
  );
  assert.deepEqual(
    sessions.map((s) => s.date),
    expected,
  );
  const roster = await dataSource.query(
    'SELECT r.name,r.school FROM class_session_students r JOIN class_sessions s ON s.id=r.session_id WHERE s.study_group_id=?',
    [group],
  );
  assert.equal(roster.length, expected.length);
  assert.ok(
    roster.every(
      (r) => r.name === 'Snapshot Student' && r.school === 'Legacy School',
    ),
  );
  await dataSource.undoLastMigration();
  const legacyMembers = await dataSource.query(
    'SELECT student_id FROM study_group_students WHERE study_group_id=?',
    [group],
  );
  assert.equal(legacyMembers.length, 1);
  await dataSource.runMigrations();

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
