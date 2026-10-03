import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigType } from '@nestjs/config';
import { SecurityModule } from '../common/security/security.module.js';
import { OperatorEntity } from '../operators/entities/operator.entity.js';
import { OwnerEntity } from '../owners/entities/owner.entity.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import authConfig from '../config/auth.config.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthSessionEntity } from './entities/auth-session.entity.js';
import { AllowedOriginGuard } from './guards/allowed-origin.guard.js';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { TenantContextGuard } from './guards/tenant-context.guard.js';
import { JwtStrategy } from './jwt.strategy.js';
import { AuthSessionsRepository } from './repositories/auth-sessions.repository.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuthSessionEntity,
      OperatorEntity,
      OwnerEntity,
      ParentEntity,
      TenantEntity,
      TutorEntity,
    ]),
    UsersModule,
    SecurityModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
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
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSessionsRepository,
    JwtStrategy,
    AllowedOriginGuard,
    AuthThrottlerGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
  ],
  exports: [AllowedOriginGuard, AuthService, AuthThrottlerGuard],
})
export class AuthModule {}
