import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export const TENANT_SCOPED_KEY = 'tenantScoped';

export const TenantScoped = () =>
  applyDecorators(
    SetMetadata(TENANT_SCOPED_KEY, true),
    ApiHeader({
      name: 'X-Tenant-Id',
      required: false,
      description:
        'Wajib untuk akun owner guna memilih tenant yang dimiliki. Akun tenant-bound hanya boleh mengirim tenant miliknya.',
      schema: { type: 'string', format: 'uuid' },
    }),
  );
