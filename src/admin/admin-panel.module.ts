import { timingSafeEqual } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DataSource } from 'typeorm';
import adminConfig from '../config/admin.config.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { TenantAdminResource } from './resources/tenant-admin.resource.js';

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
    inject: [adminConfig.KEY, DataSource],
    useFactory: (
      config: ConfigType<typeof adminConfig>,
      dataSource: DataSource,
    ) => {
      return {
        adminJsOptions: {
          rootPath: config.rootPath,
          resources: [
            {
              resource: new TenantAdminResource(dataSource),
              options: {
                navigation: {
                  name: 'Master Data',
                },
                properties: {
                  id: {
                    isVisible: {
                      list: false,
                      filter: true,
                      show: true,
                      edit: false,
                    },
                  },
                  name: {
                    isTitle: true,
                    isRequired: true,
                  },
                  address: {
                    type: 'textarea',
                  },
                  status: {
                    availableValues: [
                      { value: EntityStatus.Active, label: 'Active' },
                      { value: EntityStatus.Inactive, label: 'Inactive' },
                    ],
                  },
                  createdAt: {
                    isVisible: {
                      list: true,
                      filter: true,
                      show: true,
                      edit: false,
                    },
                  },
                  updatedAt: {
                    isVisible: {
                      list: true,
                      filter: true,
                      show: true,
                      edit: false,
                    },
                  },
                },
                listProperties: ['name', 'email', 'whatsappNumber', 'status'],
                showProperties: [
                  'id',
                  'name',
                  'address',
                  'whatsappNumber',
                  'email',
                  'logoUrl',
                  'status',
                  'createdAt',
                  'updatedAt',
                ],
                editProperties: [
                  'name',
                  'address',
                  'whatsappNumber',
                  'email',
                  'logoUrl',
                  'status',
                ],
                filterProperties: [
                  'id',
                  'name',
                  'email',
                  'whatsappNumber',
                  'status',
                  'createdAt',
                  'updatedAt',
                ],
              },
            },
          ],
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
      };
    },
  }),
);

@Module({
  imports: [adminJsModule],
})
export class AdminPanelModule {}
