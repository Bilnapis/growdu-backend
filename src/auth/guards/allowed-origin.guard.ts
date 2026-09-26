import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Request } from 'express';
import authConfig from '../../config/auth.config.js';

@Injectable()
export class AllowedOriginGuard implements CanActivate {
  constructor(
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.get('origin');
    if (!origin) {
      return true;
    }
    if (!this.config.frontendOrigins.includes(origin)) {
      throw new ForbiddenException('Origin is not allowed');
    }
    return true;
  }
}
