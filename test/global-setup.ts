import 'dotenv/config';
import { AddTenantSettings20261028000000 } from '../src/database/migrations/20261028000000-AddTenantSettings.js';
import { CreateAnnouncements20261027200000 } from '../src/database/migrations/20261027200000-CreateAnnouncements.js';
import mysql from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { CreateCoreIdentitySchema20260926000000 } from '../src/database/migrations/20260926000000-CreateCoreIdentitySchema.js';
import { AddOwnerAndAdminProfiles20260929000000 } from '../src/database/migrations/20260929000000-AddOwnerAndAdminProfiles.js';
import { RenameAdminsToOperators20260930000000 } from '../src/database/migrations/20260930000000-RenameAdminsToOperators.js';
import { CreatePlatformAdmins20261003000000 } from '../src/database/migrations/20261003000000-CreatePlatformAdmins.js';
import { AddTutorProfileDetails20261004000000 } from '../src/database/migrations/20261004000000-AddTutorProfileDetails.js';
import { AddOperatorAddress20261024000000 } from '../src/database/migrations/20261024000000-AddOperatorAddress.js';
import { CreateStudyGroups20261025000000 } from '../src/database/migrations/20261025000000-CreateStudyGroups.js';
import { CreateRoomsAndAssignSchedules20261026000000 } from '../src/database/migrations/20261026000000-CreateRoomsAndAssignSchedules.js';
import { CreateDatedSessions20261027000000 } from '../src/database/migrations/20261027000000-CreateDatedSessions.js';
import { AddOperatorMenuPermissions20261027100000 } from '../src/database/migrations/20261027100000-AddOperatorMenuPermissions.js';

const databaseNamePattern = /^growdu_e2e_\d+_\d+$/;

export default async function globalSetup(): Promise<() => Promise<void>> {
  const databaseName = `growdu_e2e_${process.pid}_${Date.now()}`;
  if (
    !databaseNamePattern.test(databaseName) ||
    databaseName === process.env.DB_NAME
  ) {
    throw new Error('Refusing to use an unsafe E2E database name');
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT ?? '3306', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD ?? '',
  });

  let created = false;
  try {
    await connection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    created = true;
    const dataSource = new DataSource({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: Number.parseInt(process.env.DB_PORT ?? '3306', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD ?? '',
      database: databaseName,
      migrations: [
        CreateCoreIdentitySchema20260926000000,
        AddOwnerAndAdminProfiles20260929000000,
        RenameAdminsToOperators20260930000000,
        CreatePlatformAdmins20261003000000,
        AddTutorProfileDetails20261004000000,
        AddOperatorAddress20261024000000,
        CreateStudyGroups20261025000000,
        CreateRoomsAndAssignSchedules20261026000000,
        CreateDatedSessions20261027000000,
        AddOperatorMenuPermissions20261027100000,
        CreateAnnouncements20261027200000,
        AddTenantSettings20261028000000,
      ],
      synchronize: false,
      migrationsRun: false,
    });
    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
    } finally {
      await dataSource.destroy();
    }
    process.env.DB_NAME = databaseName;
  } catch (error: unknown) {
    if (created) {
      await connection.query(`DROP DATABASE \`${databaseName}\``);
    }
    await connection.end();
    throw error;
  }

  await connection.end();

  return async () => {
    if (!databaseNamePattern.test(databaseName)) {
      throw new Error('Refusing to drop an unsafe E2E database name');
    }
    const cleanupConnection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number.parseInt(process.env.DB_PORT ?? '3306', 10),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD ?? '',
    });
    try {
      await cleanupConnection.query(`DROP DATABASE \`${databaseName}\``);
    } finally {
      await cleanupConnection.end();
    }
  };
}
