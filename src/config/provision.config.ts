import { registerAs } from '@nestjs/config';

export default registerAs('provision', () => ({
  tenantName: process.env.PROVISION_TENANT_NAME ?? '',
  ownerName: process.env.PROVISION_OWNER_NAME ?? '',
  ownerPhoneNumber: process.env.PROVISION_OWNER_PHONE_NUMBER ?? '',
  ownerEmail: (process.env.PROVISION_OWNER_EMAIL ?? '').trim().toLowerCase(),
  ownerPassword: process.env.PROVISION_OWNER_PASSWORD ?? '',
}));
