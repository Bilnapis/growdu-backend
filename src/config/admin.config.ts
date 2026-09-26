import { registerAs } from '@nestjs/config';

export default registerAs('admin', () => ({
  rootPath: process.env.ADMIN_ROOT_PATH ?? '/admin',
  email: process.env.ADMIN_EMAIL ?? '',
  password: process.env.ADMIN_PASSWORD ?? '',
  cookieSecret: process.env.ADMIN_COOKIE_SECRET ?? '',
  secureCookies: process.env.NODE_ENV === 'production',
}));
