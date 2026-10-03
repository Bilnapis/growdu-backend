import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import authConfig from '../../config/auth.config.js';
import { PlatformAdminAuthService } from '../platform-admin-auth.service.js';
import type { PlatformAdminAuthenticated } from '../types/platform-admin-authenticated.type.js';
import type { PlatformAdminJwtPayload } from '../types/platform-admin-jwt-payload.type.js';

interface PlatformAdminRequest extends Request {
  platformAdmin?: PlatformAdminAuthenticated;
}

@Injectable()
export class PlatformAdminAccessGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly platformAdminAuthService: PlatformAdminAuthService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformAdminRequest>();
    const token = this.getBearerToken(request);
    if (!token) throw new UnauthorizedException('Platform admin access token is required');

    let payload: PlatformAdminJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<PlatformAdminJwtPayload>(token, {
        secret: this.config.accessTokenSecret,
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired platform admin session');
    }

    if (payload.kind !== 'platform-admin') {
      throw new UnauthorizedException('Invalid platform admin access token');
    }

    request.platformAdmin = await this.platformAdminAuthService.validateAccessToken(payload);
    return true;
  }

  private getBearerToken(request: Request): string | null {
    const authorization = request.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return null;
    const token = authorization.slice('Bearer '.length).trim();
    return token || null;
  }
}
