import { Controller, Get, Req } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { type Request } from 'express';
import request from 'supertest';
import { configureApplication } from './app.setup.js';
import appConfig from './config/app.config.js';
import authConfig from './config/auth.config.js';

@Controller('request-info')
class RequestInfoController {
  @Get()
  getRequestInfo(@Req() incoming: Request) {
    return { ip: incoming.ip, secure: incoming.secure };
  }
}

describe('reverse proxy configuration', () => {
  it.each([0, 1])('trusts exactly %i proxy hops', async (hops) => {
    const module = await Test.createTestingModule({
      controllers: [RequestInfoController],
      providers: [
        {
          provide: appConfig.KEY,
          useValue: {
            ...appConfig(),
            swaggerEnabled: false,
            trustProxyHops: hops,
          },
        },
        { provide: authConfig.KEY, useValue: { frontendOrigins: [] } },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>();
    try {
      configureApplication(app);
      await app.init();
      const response = await request(app.getHttpServer())
        .get('/api/v1/request-info')
        .set('X-Forwarded-For', '198.51.100.10, 203.0.113.20')
        .set('X-Forwarded-Proto', 'https')
        .expect(200);
      expect(response.body.secure).toBe(hops === 1);
      if (hops === 1) {
        expect(response.body.ip).toBe('203.0.113.20');
      } else {
        expect(response.body.ip).not.toBe('203.0.113.20');
        expect(response.body.ip).not.toBe('198.51.100.10');
      }
    } finally {
      await app.close();
    }
  });
});
