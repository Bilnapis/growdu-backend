import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApplication } from './app.setup.js';
import appConfig from './config/app.config.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  configureApplication(app);
  app.enableShutdownHooks();

  await app.listen(config.port);
}
await bootstrap();
