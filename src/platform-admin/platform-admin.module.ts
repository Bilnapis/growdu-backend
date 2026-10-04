import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { SecurityModule } from '../common/security/security.module.js';
import authConfig from '../config/auth.config.js';
import { PlatformAdminSessionEntity } from './entities/platform-admin-session.entity.js';
import { PlatformAdminEntity } from './entities/platform-admin.entity.js';
import { PlatformAdminAccessGuard } from './guards/platform-admin-access.guard.js';
import { PlatformAdminAuthController } from './platform-admin-auth.controller.js';
import { PlatformAdminAuthService } from './platform-admin-auth.service.js';
import { PlatformAdminUsersController } from './platform-admin-users.controller.js';
import { PlatformAdminUsersService } from './platform-admin-users.service.js';
import { PlatformAdminTenantsController } from './platform-admin-tenants.controller.js';
import { PlatformAdminTenantsService } from './platform-admin-tenants.service.js';
import { TenantLogoStorageService } from './tenant-logo-storage.service.js';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity.js';
import { OwnerEntity } from '../owners/entities/owner.entity.js';
import { OperatorEntity } from '../operators/entities/operator.entity.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { UserEntity } from '../users/entities/user.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlatformAdminEntity,
      PlatformAdminSessionEntity,
      AuthSessionEntity,
      UserEntity,
      OwnerEntity,
      OperatorEntity,
      ParentEntity,
      TenantEntity,
      TutorEntity,
    ]),
    SecurityModule,
    AuthModule,
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.accessTokenSecret,
        signOptions: {
          expiresIn: config.accessTokenTtlSeconds,
          issuer: config.issuer,
          audience: config.audience,
        },
      }),
    }),
  ],
  controllers: [
    PlatformAdminAuthController,
    PlatformAdminUsersController,
    PlatformAdminTenantsController,
  ],
  providers: [
    PlatformAdminAuthService,
    PlatformAdminAccessGuard,
    PlatformAdminUsersService,
    PlatformAdminTenantsService,
    TenantLogoStorageService,
  ],
  exports: [PlatformAdminAuthService],
})
export class PlatformAdminModule {}
