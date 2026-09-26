import { timingSafeEqual } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import adminConfig from '../config/admin.config.js';

function safelyMatches(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

const adminJsModule = import('@adminjs/nestjs').then(({ AdminModule }) =>
  AdminModule.createAdminAsync({
    inject: [adminConfig.KEY],
    useFactory: (config: ConfigType<typeof adminConfig>) => ({
      adminJsOptions: {
        rootPath: config.rootPath,
        resources: [],
        branding: {
          companyName: 'Growdu Admin',
          withMadeWithLove: false,
        },
      },
      auth: {
        cookieName: 'growdu-admin',
        cookiePassword: config.cookieSecret,
        authenticate: async (email: string, password: string) => {
          const isValid =
            safelyMatches(email, config.email) &&
            safelyMatches(password, config.password);

          return isValid ? { email: config.email } : null;
        },
      },
      sessionOptions: {
        secret: config.cookieSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.secureCookies,
          maxAge: 8 * 60 * 60 * 1_000,
        },
      },
    }),
  }),
);

@Module({
  imports: [adminJsModule],
})
export class AdminPanelModule {}
