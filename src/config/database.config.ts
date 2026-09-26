import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number.parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USERNAME ?? '',
  password: process.env.DB_PASSWORD ?? '',
  name: process.env.DB_NAME ?? '',
  logging: process.env.DB_LOGGING === 'true',
  poolSize: Number.parseInt(process.env.DB_POOL_SIZE ?? '10', 10),
}));
