import { ValidationPipe } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import { isAllowedFrontendOrigin } from './auth/allowed-origin.util.js';
import appConfig from './config/app.config.js';
import authConfig from './config/auth.config.js';

export function configureApplication(app: NestExpressApplication): void {
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  const authentication = app.get<ConfigType<typeof authConfig>>(authConfig.KEY);

  app.setGlobalPrefix(config.apiPrefix);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (
        !origin ||
        isAllowedFrontendOrigin(
          origin,
          authentication.frontendOrigins,
          config.nodeEnv,
        )
      ) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  });
  app.use(cookieParser());
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  if (!config.swaggerEnabled) {
    return;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Growdu Backend Admin')
    .setDescription(
      'Dashboard dokumentasi dan pengujian endpoint Growdu Backend.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(authentication.cookieName, {
      type: 'apiKey',
      in: 'cookie',
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup(config.swaggerPath, app, document, {
    customSiteTitle: 'Growdu Backend Admin',
    swaggerOptions: {
      displayRequestDuration: true,
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
