import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PlatformAdminAuthenticated } from '../types/platform-admin-authenticated.type.js';

interface PlatformAdminRequest extends Request {
  platformAdmin?: PlatformAdminAuthenticated;
}

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PlatformAdminAuthenticated => {
    const request = context.switchToHttp().getRequest<PlatformAdminRequest>();
    return request.platformAdmin as PlatformAdminAuthenticated;
  },
);
