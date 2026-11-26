import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const databaseName = `growdu_payroll_calendar_${process.pid}_${Date.now()}`;
const safeName = /^growdu_payroll_calendar_\d+_\d+$/;
if (!safeName.test(databaseName) || databaseName === process.env.DB_NAME)
  throw new Error('Refusing to use an unsafe verification database');
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
  await db.initialize();
  await db.runMigrations();
  await db.undoLastMigration();
  const [user, owner, tenant, tutor, period, payroll, issued] = Array.from(
    { length: 7 },
    () => randomUUID(),
  );
  await db.query(
    "INSERT INTO users (id,email,password_hash,role) VALUES (?,'calendar@example.invalid','fixture-only','owner')",
    [user],
  );
  await db.query(
    "INSERT INTO owners (id,user_id,name,phone_number) VALUES (?,?,'Calendar Owner','0800')",
    [owner, user],
  );
  await db.query(
    "INSERT INTO tenants (id,owner_id,name) VALUES (?,?,'Calendar Tenant')",
    [tenant, owner],
  );
  await db.query(
    "INSERT INTO tutors (id,tenant_id,name,phone_number,session_rate) VALUES (?,?,'Calendar Tutor','0801',10000)",
    [tutor, tenant],
  );
  await db.query(
    "INSERT INTO payroll_settings (tenant_id,payday,enabled,activated_date) VALUES (?,5,1,'2026-11-01')",
    [tenant],
  );
  await db.query(
    "INSERT INTO payroll_periods (id,tenant_id,start_date,end_date,pay_date) VALUES (?,?,'2026-10-05','2026-11-04','2026-11-05')",
    [period, tenant],
  );
  // A completed calendar period is preserved, including its existing payroll.
  await db.query(
    "INSERT INTO payroll_periods (id,tenant_id,start_date,end_date,pay_date,generated_at,processed_at) VALUES (?,?,'2026-09-01','2026-09-30','2026-10-05',NOW(),NOW())",
    [issued, tenant],
  );
  await db.query(
    "INSERT INTO payrolls (id,tenant_id,tutor_id,period_id,number,tutor_name,start_date,end_date,pay_date,issued_date,default_rate,snapshot,total) VALUES (?,?,?,?,'FIXTURE','Tutor','2026-09-05','2026-10-04','2026-10-05','2026-10-05',10000,'{}',10000)",
    [payroll, tenant, tutor, issued],
  );
  await assert.rejects(db.runMigrations(), /legacy payroll history exists/);
  await db.query(
    "UPDATE payrolls SET start_date='2026-09-01',end_date='2026-09-30' WHERE id=?",
    [payroll],
  );
  const rows = () =>
    db.query(
      'SELECT id,CAST(start_date AS CHAR) startDate,CAST(end_date AS CHAR) endDate,CAST(pay_date AS CHAR) payDate,generated_at,processed_at FROM payroll_periods ORDER BY id',
    );
  const original = await rows();
  await db.runMigrations();
  const converted = await rows();
  assert.deepEqual(
    converted.find((r) => r.id === issued),
    original.find((r) => r.id === issued),
  );
  assert.deepEqual(
    converted.find((r) => r.id === period),
    {
      id: period,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      payDate: '2026-11-05',
      generated_at: null,
      processed_at: null,
    },
  );
  const [settings] = await db.query(
    'SELECT payday,enabled FROM payroll_settings WHERE tenant_id=?',
    [tenant],
  );
  assert.deepEqual(settings, { payday: 5, enabled: 1 });
  await db.undoLastMigration();
  assert.deepEqual(await rows(), original);
  await db.runMigrations();
  assert.deepEqual(await rows(), converted);
  await db.query('UPDATE payroll_periods SET generated_at=NOW() WHERE id=?', [
    period,
  ]);
  await assert.rejects(db.undoLastMigration(), /Rollback refused/);
  assert.deepEqual(
    (await rows()).find((r) => r.id === period).startDate,
    '2026-10-01',
  );
  console.log(
    'Calendar payroll migration verified: up/down/up, exact ranges, unchanged published history/settings, legacy refusal and rollback protection.',
  );
} finally {
  if (db?.isInitialized) await db.destroy();
  if (created && safeName.test(databaseName))
    await connection.query(`DROP DATABASE \`${databaseName}\``);
  await connection.end();
}
