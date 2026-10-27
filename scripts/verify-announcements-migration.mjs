import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const databaseName = `growdu_announcements_verify_${process.pid}_${Date.now()}`;
const safeName = /^growdu_announcements_verify_\d+_\d+$/;
if (!safeName.test(databaseName) || databaseName === process.env.DB_NAME) {
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
  assert.equal(migrations.at(-1)?.name, 'CreateAnnouncements20261027200000');
  assert.equal(await dataSource.showMigrations(), false);
  const [user, owner, tenant, announcement] = Array.from({ length: 4 }, () =>
    randomUUID(),
  );
  await dataSource.query(
    "INSERT INTO users (id,email,password_hash,role) VALUES (?,?,'fixture-only','owner')",
    [user, 'announcements-migration@example.invalid'],
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
    "INSERT INTO announcements (id,tenant_id,title,content,target_role,starts_at,ends_at) VALUES (?,?,'Judul','Isi','all',?,?)",
    [
      announcement,
      tenant,
      '2026-10-27T01:00:00.000Z',
      '2026-10-27T02:00:00.000Z',
    ],
  );
  const rows = await dataSource.query(
    'SELECT starts_at,ends_at FROM announcements WHERE id=?',
    [announcement],
  );
  assert.deepEqual(rows[0], {
    starts_at: '2026-10-27T01:00:00.000Z',
    ends_at: '2026-10-27T02:00:00.000Z',
  });
  await assert.rejects(
    dataSource.query(
      "INSERT INTO announcements (id,tenant_id,title,content,target_role) VALUES (?,?,'Invalid','Isi','all')",
      [randomUUID(), randomUUID()],
    ),
  );
  await assert.rejects(
    dataSource.query('UPDATE announcements SET starts_at=NULL WHERE id=?', [
      announcement,
    ]),
  );
  await dataSource.undoLastMigration();
  const tables = await dataSource.query("SHOW TABLES LIKE 'announcements'");
  assert.equal(tables.length, 0);
  assert.equal(
    (await dataSource.query('SELECT id FROM tenants WHERE id=?', [tenant]))
      .length,
    1,
  );
  assert.equal((await dataSource.runMigrations()).length, 1);
  assert.equal(
    Number(
      (await dataSource.query('SELECT COUNT(*) AS count FROM announcements'))[0]
        .count,
    ),
    0,
  );
  console.log(
    'Announcements migration up -> down -> up, UTC storage, FK and date constraints verified.',
  );
} finally {
  if (dataSource?.isInitialized) await dataSource.destroy();
  if (created && safeName.test(databaseName))
    await connection.query(`DROP DATABASE \`${databaseName}\``);
  await connection.end();
}
