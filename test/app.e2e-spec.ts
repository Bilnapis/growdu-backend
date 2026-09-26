import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApplication } from './../src/app.setup.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await NestFactory.create<INestApplication<App>>(AppModule, {
      logger: false,
    });
    configureApplication(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect({ service: 'growdu-backend', status: 'ok' });
  });

  it('/admin (GET)', () => {
    return request(app.getHttpServer())
      .get('/admin')
      .expect(302)
      .expect('Location', '/admin/login');
  });

  it('/admin/login (GET)', () => {
    return request(app.getHttpServer())
      .get('/admin/login')
      .expect(200)
      .expect(/Growdu Admin/);
  });

  it('/docs (GET)', () => {
    return request(app.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect(/Growdu Backend Admin/);
  });

  afterAll(async () => {
    await app.close();
  });
});
