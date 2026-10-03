import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Request } from 'express';
import appConfig from '../../config/app.config.js';
import authConfig from '../../config/auth.config.js';
import { isAllowedFrontendOrigin } from '../allowed-origin.util.js';

@Injectable()
export class AllowedOriginGuard implements CanActivate {
  constructor(
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
    @Inject(appConfig.KEY)
    private readonly applicationConfig: ConfigType<typeof appConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.get('origin');
    if (!origin) {
      return true;
    }
    if (
      !isAllowedFrontendOrigin(
        origin,
        this.config.frontendOrigins,
        this.applicationConfig.nodeEnv,
      )
    ) {
      throw new ForbiddenException('Origin is not allowed');
    }
    return true;
  }
}
