import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/entities/user.entity.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';
import { RolesGuard } from './roles.guard.js';

function createContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows routes without role metadata', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    expect(new RolesGuard(reflector).canActivate(createContext())).toBe(true);
  });

  it('allows a principal with an accepted role', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([UserRole.Owner]),
    } as unknown as Reflector;
    const user: AuthenticatedUser = {
      id: 'user-id',
      sessionId: 'session-id',
      tenantId: 'tenant-id',
      email: 'owner@example.com',
      role: UserRole.Owner,
    };

    expect(new RolesGuard(reflector).canActivate(createContext(user))).toBe(
      true,
    );
  });

  it('rejects a principal without an accepted role', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([UserRole.Owner]),
    } as unknown as Reflector;
    const user: AuthenticatedUser = {
      id: 'user-id',
      sessionId: 'session-id',
      tenantId: 'tenant-id',
      email: 'operator@example.com',
      role: UserRole.Operator,
    };

    expect(() =>
      new RolesGuard(reflector).canActivate(createContext(user)),
    ).toThrow(ForbiddenException);
  });
});
