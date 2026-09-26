import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Joi from 'joi';
import { SecurityModule } from '../common/security/security.module.js';
import databaseConfig from '../config/database.config.js';
import provisionConfig from '../config/provision.config.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { ProvisionOwnerService } from './provision-owner.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [databaseConfig, provisionConfig],
      validationSchema: Joi.object({
        DB_HOST: Joi.string().hostname().required(),
        DB_PORT: Joi.number().port().default(3306),
        DB_USERNAME: Joi.string().trim().required(),
        DB_PASSWORD: Joi.string().allow('').default(''),
        DB_NAME: Joi.string().trim().required(),
        DB_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),
        DB_POOL_SIZE: Joi.number().integer().min(1).max(100).default(10),
        PROVISION_TENANT_NAME: Joi.string().trim().min(2).max(150).required(),
        PROVISION_OWNER_EMAIL: Joi.string().email().max(150).required(),
        PROVISION_OWNER_PASSWORD: Joi.string().min(12).max(128).required(),
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
        entities: [TenantEntity, UserEntity],
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    TypeOrmModule.forFeature([TenantEntity, UserEntity]),
    SecurityModule,
  ],
  providers: [ProvisionOwnerService],
})
export class ProvisionOwnerModule {}
