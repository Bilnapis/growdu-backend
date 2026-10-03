import { registerAs } from '@nestjs/config';

export default registerAs('platformAdminProvision', () => ({
  email: (process.env.PLATFORM_ADMIN_EMAIL ?? '').trim().toLowerCase(),
  password: process.env.PLATFORM_ADMIN_PASSWORD ?? '',
}));
