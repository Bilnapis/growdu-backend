import { UserRole } from '../../users/entities/user.entity.js';
import { OperatorMenu } from '../../operators/menu-permissions.js';

export interface AuthenticatedUser {
  menuPermissions?: OperatorMenu[];
  id: string;
  sessionId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}
