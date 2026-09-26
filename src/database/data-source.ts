import 'dotenv/config';
import { DataSource } from 'typeorm';

const requiredEnvironmentVariables = [
  'DB_HOST',
  'DB_USERNAME',
  'DB_NAME',
] as const;

for (const variable of requiredEnvironmentVariables) {
  if (!process.env[variable]) {
    throw new Error(`Missing required environment variable: ${variable}`);
  }
}

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME,
  entities: ['src/**/*.entity.ts', 'dist/**/*.entity.js'],
  migrations: ['src/database/migrations/*.ts', 'dist/database/migrations/*.js'],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  poolSize: Number.parseInt(process.env.DB_POOL_SIZE ?? '10', 10),
});

export default dataSource;
