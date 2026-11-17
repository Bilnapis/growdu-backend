import { ConfigModule } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';
import { AdminPanelModule } from './admin-panel.module.js';
import adminConfig from '../config/admin.config.js';

describe('optional AdminJS', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['false', 'FALSE'])(
    'does not mount AdminJS or require a database when disabled with %s',
    async (enabled) => {
      vi.stubEnv('ADMIN_ENABLED', enabled);
      const configuration = await ConfigModule.forRoot({ ignoreEnvFile: true });
      const module = await Test.createTestingModule({
        imports: [configuration, AdminPanelModule.register()],
      }).compile();
      const app = module.createNestApplication<NestExpressApplication>();
      try {
        await app.init();
        await request(app.getHttpServer())
          .get('/backend-admin/login')
          .expect(404);
      } finally {
        await app.close();
      }
    },
  );

  it('keeps AdminJS enabled when no flag is supplied', () => {
    vi.stubEnv('ADMIN_ENABLED', undefined);
    expect(adminConfig().enabled).toBe(true);
  });
});
