import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdminPanelModule } from './admin/admin-panel.module.js';
import { AuthModule } from './auth/auth.module.js';
import adminConfig from './config/admin.config.js';
import appConfig from './config/app.config.js';
import authConfig from './config/auth.config.js';
import databaseConfig from './config/database.config.js';
import { environmentValidationSchema } from './config/environment.validation.js';
import { ParentsModule } from './parents/parents.module.js';
import { StudentsModule } from './students/students.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { TutorsModule } from './tutors/tutors.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [adminConfig, appConfig, authConfig, databaseConfig],
      validationSchema: environmentValidationSchema,
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
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        retryAttempts: 5,
        retryDelay: 3_000,
      }),
    }),
    AuthModule,
    TenantsModule,
    UsersModule,
    TutorsModule,
    ParentsModule,
    StudentsModule,
    AdminPanelModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
