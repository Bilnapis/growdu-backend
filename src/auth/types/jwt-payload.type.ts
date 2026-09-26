import { UserRole } from '../../users/entities/user.entity.js';

export interface JwtPayload {
  sub: string;
  sid: string;
  tenantId: string;
  role: UserRole;
}
