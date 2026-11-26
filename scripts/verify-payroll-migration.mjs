import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { readdir } from 'node:fs/promises';

const databaseName = `growdu_payroll_migration_${process.pid}_${Date.now()}`;
const safeName = /^growdu_payroll_migration_\d+_\d+$/;
if (!safeName.test(databaseName) || databaseName === process.env.DB_NAME)
  throw new Error('Refusing to use an unsafe migration verification database');
const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? '3306', 10),
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
  const migrationFiles = await readdir('src/database/migrations');
  db.setOptions({
    migrations: migrationFiles
      .filter(
        (name) => name.endsWith('.ts') && name.slice(0, 14) <= '20261116000000',
      )
      .map((name) => `src/database/migrations/${name}`),
  });
  await db.initialize();
  await db.runMigrations();
  const [latest] = await db.query(
    'SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1',
  );
  assert.equal(latest.name, 'CreatePayroll20261116000000');
  await db.undoLastMigration();
  const [
    user,
    owner,
    tenant,
    tutor,
    period,
    payroll,
    foreignTenant,
    foreignTutor,
  ] = Array.from({ length: 8 }, () => randomUUID());
  await db.query(
    "INSERT INTO users (id,email,password_hash,role) VALUES (?,?,'fixture-only','owner')",
    [user, 'payroll-migration@example.invalid'],
  );
  await db.query(
    "INSERT INTO owners (id,user_id,name,phone_number) VALUES (?,?,'Payroll migration owner','0800000000')",
    [owner, user],
  );
  for (const id of [tenant, foreignTenant])
    await db.query(
      "INSERT INTO tenants (id,owner_id,name) VALUES (?,?,'Payroll migration tenant')",
      [id, owner],
    );
  for (const [id, tenantId] of [
    [tutor, tenant],
    [foreignTutor, foreignTenant],
  ])
    await db.query(
      "INSERT INTO tutors (id,tenant_id,name,phone_number,session_rate) VALUES (?,?,'Legacy Tutor','0800000001',150000.25)",
      [id, tenantId],
    );
  await db.runMigrations();
  const [legacy] = await db.query(
    'SELECT session_rate FROM tutors WHERE id=?',
    [tutor],
  );
  assert.equal(legacy.session_rate, '150000.25');
  await db.query(
    "INSERT INTO payroll_settings (tenant_id,activated_date) VALUES (?,'2026-11-01')",
    [tenant],
  );
  const [settings] = await db.query(
    'SELECT payday,enabled FROM payroll_settings WHERE tenant_id=?',
    [tenant],
  );
  assert.equal(settings.payday, 1);
  assert.equal(settings.enabled, 0);
  await db.query(
    "INSERT INTO payroll_periods (id,tenant_id,start_date,end_date,pay_date) VALUES (?,?,'2026-10-05','2026-11-04','2026-11-05')",
    [period, tenant],
  );
  const insert = (id, tutorId, number) =>
    db.query(
      "INSERT INTO payrolls (id,tenant_id,tutor_id,period_id,number,tutor_name,start_date,end_date,pay_date,issued_date,default_rate,snapshot,total) VALUES (?,?,?,?,?,'Legacy Tutor','2026-10-05','2026-11-04','2026-11-05','2026-11-05',150000.25,'{}',150000.25)",
      [id, tenant, tutorId, period, number],
    );
  await assert.rejects(
    insert(randomUUID(), foreignTutor, 'PAY-FOREIGN'),
    /foreign key constraint/i,
  );
  await insert(payroll, tutor, 'PAY-202611-001');
  await assert.rejects(
    insert(randomUUID(), tutor, 'PAY-202611-002'),
    /Duplicate entry/i,
  );
  await assert.rejects(
    db.undoLastMigration(),
    /Rollback refused: payroll history exists/,
  );
  assert.equal(
    (await db.query('SELECT id FROM payrolls WHERE id=?', [payroll])).length,
    1,
  );
  // Remove only the synthetic fixture in this disposable database to test the empty rollback.
  await db.query('DELETE FROM payrolls WHERE id=?', [payroll]);
  await db.undoLastMigration();
  await db.runMigrations();
  assert.equal(await db.showMigrations(), false);
  console.log(
    'Payroll migration verified: up/down/up, legacy rates, defaults, tenant foreign keys, uniqueness, and protected history.',
  );
} finally {
  if (db?.isInitialized) await db.destroy();
  if (created && safeName.test(databaseName))
    await connection.query(`DROP DATABASE \`${databaseName}\``);
  await connection.end();
}
