import { UserRole } from '../../users/entities/user.entity.js';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}
