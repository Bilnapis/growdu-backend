import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import authConfig from '../config/auth.config.js';
import { UserRole } from '../users/entities/user.entity.js';
import { AuthService } from './auth.service.js';
import { AuthenticatedUser } from './types/authenticated-user.type.js';
import { JwtPayload } from './types/jwt-payload.type.js';

interface UnknownJwtPayload {
  sub?: unknown;
  sid?: unknown;
  role?: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(authConfig.KEY)
    config: ConfigType<typeof authConfig>,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.accessTokenSecret,
      issuer: config.issuer,
      audience: config.audience,
    });
  }

  validate(value: UnknownJwtPayload): Promise<AuthenticatedUser> {
    if (
      typeof value.sub !== 'string' ||
      typeof value.sid !== 'string' ||
      !Object.values(UserRole).includes(value.role as UserRole)
    ) {
      throw new UnauthorizedException('Invalid access token');
    }
    const payload: JwtPayload = {
      sub: value.sub,
      sid: value.sid,
      role: value.role as UserRole,
    };
    return this.authService.validateAccessToken(payload);
  }
}
