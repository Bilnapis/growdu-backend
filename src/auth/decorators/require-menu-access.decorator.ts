import { SetMetadata } from '@nestjs/common';
import { OperatorMenu } from '../../operators/menu-permissions.js';

export const MENU_ACCESS_KEY = 'operator-menu-access';
export const RequireMenuAccess = (menu: OperatorMenu) =>
  SetMetadata(MENU_ACCESS_KEY, menu);
