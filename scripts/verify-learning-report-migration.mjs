import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const databaseName = `growdu_report_migration_${process.pid}_${Date.now()}`;
const safeName = /^growdu_report_migration_\d+_\d+$/;
if (!safeName.test(databaseName) || databaseName === process.env.DB_NAME)
  throw new Error('Unsafe verification database');
const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD ?? '',
});
let created = false;
let db;
try {
  await connection.query(
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  created = true;
  process.env.DB_NAME = databaseName;
  ({ default: db } = await import('../src/database/data-source.ts'));
  await db.initialize();
  await db.runMigrations();
  const [latest] = await db.query(
    'SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1',
  );
  assert.equal(latest.name, 'CreateLearningReports20261122000000');
  await db.undoLastMigration();
  const [user, owner, tenant, group, tutor] = Array.from({ length: 5 }, () =>
    randomUUID(),
  );
  await db.query(
    "INSERT INTO users(id,email,password_hash,role) VALUES (?,?,'fixture','owner')",
    [user, randomUUID() + '@example.invalid'],
  );
  await db.query(
    "INSERT INTO owners(id,user_id,name,phone_number) VALUES (?,?,'Owner','0800000000')",
    [owner, user],
  );
  await db.query(
    "INSERT INTO tenants(id,owner_id,name) VALUES (?,?,'Bimbel')",
    [tenant, owner],
  );
  await db.query(
    "INSERT INTO study_groups(id,tenant_id,name) VALUES (?,?,'Legacy group')",
    [group, tenant],
  );
  await db.query(
    "INSERT INTO tutors(id,tenant_id,name,phone_number,session_rate) VALUES (?,?,'Tutor','0800000001',0)",
    [tutor, tenant],
  );
  await db.runMigrations();
  const report = randomUUID(),
    revision = randomUUID();
  await db.query(
    "INSERT INTO learning_reports(id,tenant_id,study_group_id,period,tutor_id) VALUES (?,?,?,'2026-09',?)",
    [report, tenant, group, tutor],
  );
  await db.query(
    'INSERT INTO learning_report_revisions(id,report_id,number,content) VALUES (?,?,1,?)',
    [
      revision,
      report,
      JSON.stringify({
        material: '',
        progress: '',
        followUp: '',
        parentNote: '',
      }),
    ],
  );
  await db.query('UPDATE learning_reports SET draft_revision_id=? WHERE id=?', [
    revision,
    report,
  ]);
  await db.undoLastMigration();
  const [legacy] = await db.query(
    'SELECT COUNT(*) count FROM study_groups WHERE id=?',
    [group],
  );
  assert.equal(Number(legacy.count), 1);
  const [missing] = await db.query(
    "SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=? AND table_name LIKE 'learning_report%'",
    [databaseName],
  );
  assert.equal(Number(missing.count), 0);
  await db.runMigrations();
  console.log(
    'Learning reports migration: up -> down with data -> up passed; legacy rows preserved.',
  );
} finally {
  if (db?.isInitialized) await db.destroy();
  if (created && safeName.test(databaseName))
    await connection.query(`DROP DATABASE \`${databaseName}\``);
  await connection.end();
}
