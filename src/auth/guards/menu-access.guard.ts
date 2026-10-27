import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OperatorMenu } from '../../operators/menu-permissions.js';
import { UserRole } from '../../users/entities/user.entity.js';
import { MENU_ACCESS_KEY } from '../decorators/require-menu-access.decorator.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';

@Injectable()
export class MenuAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const menu = this.reflector.getAllAndOverride<OperatorMenu>(MENU_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!menu) return true;
    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!user) throw new ForbiddenException('Insufficient menu permissions');
    if (user.role !== UserRole.Operator) return true;
    if (!user.menuPermissions?.includes(menu)) {
      throw new ForbiddenException('Insufficient menu permissions');
    }
    return true;
  }
}
