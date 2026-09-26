import { registerAs } from '@nestjs/config';

export default registerAs('provision', () => ({
  tenantName: process.env.PROVISION_TENANT_NAME ?? '',
  ownerEmail: (process.env.PROVISION_OWNER_EMAIL ?? '').trim().toLowerCase(),
  ownerPassword: process.env.PROVISION_OWNER_PASSWORD ?? '',
}));
