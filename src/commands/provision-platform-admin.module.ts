import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Joi from 'joi';
import { SecurityModule } from '../common/security/security.module.js';
import databaseConfig from '../config/database.config.js';
import platformAdminProvisionConfig from '../config/platform-admin-provision.config.js';
import { PlatformAdminEntity } from '../platform-admin/entities/platform-admin.entity.js';
import { ProvisionPlatformAdminService } from './provision-platform-admin.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [databaseConfig, platformAdminProvisionConfig],
      validationSchema: Joi.object({
        DB_HOST: Joi.string().hostname().required(),
        DB_PORT: Joi.number().port().default(3306),
        DB_USERNAME: Joi.string().trim().required(),
        DB_PASSWORD: Joi.string().allow('').default(''),
        DB_NAME: Joi.string().trim().required(),
        DB_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),
        DB_POOL_SIZE: Joi.number().integer().min(1).max(100).default(10),
        PLATFORM_ADMIN_EMAIL: Joi.string().email().max(150).required(),
        PLATFORM_ADMIN_PASSWORD: Joi.string().min(5).max(128).required(),
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: ConfigType<typeof databaseConfig>) => ({
        type: 'mysql',
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        database: config.name,
        logging: config.logging,
        poolSize: config.poolSize,
        entities: [PlatformAdminEntity],
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    TypeOrmModule.forFeature([PlatformAdminEntity]),
    SecurityModule,
  ],
  providers: [ProvisionPlatformAdminService],
})
export class ProvisionPlatformAdminModule {}
