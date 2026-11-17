import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const databaseName = `growdu_invoice_migration_${process.pid}_${Date.now()}`;
const safeName = /^growdu_invoice_migration_\d+_\d+$/;
if (!safeName.test(databaseName) || databaseName === process.env.DB_NAME) {
  throw new Error('Refusing to use an unsafe migration verification database');
}
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
  // This verifier exercises the invoice migration as its final migration.
  // Later feature migrations are covered by their own verification scripts.
  db.migrations = db.migrations.filter(
    (migration) =>
      Number(
        (migration.name ?? migration.constructor.name).match(/\d+$/)?.[0],
      ) <= 20261115000000,
  );
  await db.runMigrations();
  assert.equal(
    db.migrations.at(-1)?.constructor.name,
    'CreateInvoices20261115000000',
  );
  await db.undoLastMigration();
  const [user, owner, tenant, activeStudent, inactiveStudent, invoice] =
    Array.from({ length: 6 }, () => randomUUID());
  await db.query(
    "INSERT INTO users (id,email,password_hash,role) VALUES (?,?,'fixture-only','owner')",
    [user, 'invoice-migration@example.invalid'],
  );
  await db.query(
    "INSERT INTO owners (id,user_id,name,phone_number) VALUES (?,?,'Invoice migration owner','0800000000')",
    [owner, user],
  );
  await db.query(
    "INSERT INTO tenants (id,owner_id,name) VALUES (?,?,'Invoice migration tenant')",
    [tenant, owner],
  );
  for (const [id, status] of [
    [activeStudent, 'active'],
    [inactiveStudent, 'inactive'],
  ]) {
    await db.query(
      "INSERT INTO students (id,tenant_id,student_code,name,gender,education_level,school,address,status) VALUES (?,?,?,'Legacy Student','female','SMA','School','Jakarta',?)",
      [id, tenant, id.slice(0, 8), status],
    );
  }
  await db.runMigrations();
  const students = await db.query(
    'SELECT status,administrative_status,billing_blocked,monthly_fee,next_invoice_period FROM students WHERE tenant_id=? ORDER BY status',
    [tenant],
  );
  assert.equal(students.length, 2);
  for (const student of students) {
    assert.equal(student.administrative_status, student.status);
    assert.equal(student.billing_blocked, 0);
    assert.equal(student.monthly_fee, null);
    assert.equal(student.next_invoice_period, null);
  }
  await db.query('INSERT INTO invoice_settings (tenant_id) VALUES (?)', [
    tenant,
  ]);
  const [settings] = await db.query(
    'SELECT due_day,grace_days FROM invoice_settings WHERE tenant_id=?',
    [tenant],
  );
  assert.equal(settings.due_day, 1);
  assert.equal(settings.grace_days, 0);
  await db.query(
    "UPDATE students SET status='inactive',billing_blocked=1 WHERE id=?",
    [activeStudent],
  );
  await db.query(
    "INSERT INTO invoices (id,tenant_id,student_id,number,period,issued_date,due_date,grace_days,suspension_date,student_name,snapshot,total) VALUES (?,?,?,'INV-202601-001','2026-01','2026-01-01','2026-01-01',0,'2026-01-02','Legacy Student','{}',100)",
    [invoice, tenant, activeStudent],
  );
  await assert.rejects(
    db.undoLastMigration(),
    /Rollback refused: invoice history exists/,
  );
  assert.equal(
    (await db.query('SELECT id FROM invoices WHERE id=?', [invoice])).length,
    1,
  );
  // Only this isolated, generated fixture is removed to test a safe empty rollback.
  await db.query('DELETE FROM invoices WHERE id=?', [invoice]);
  await db.undoLastMigration();
  const [restored] = await db.query('SELECT status FROM students WHERE id=?', [
    activeStudent,
  ]);
  assert.equal(restored.status, 'active');
  await db.runMigrations();
  console.log(
    'Invoice migration verified: legacy status preservation, defaults 1/0, protected history, and safe up -> down -> up.',
  );
} finally {
  if (db?.isInitialized) await db.destroy();
  if (created && safeName.test(databaseName))
    await connection.query(`DROP DATABASE \`${databaseName}\``);
  await connection.end();
}
