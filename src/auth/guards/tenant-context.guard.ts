import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { OwnerEntity } from '../../owners/entities/owner.entity.js';
import { TenantEntity } from '../../tenants/entities/tenant.entity.js';
import { UserRole } from '../../users/entities/user.entity.js';
import { TENANT_SCOPED_KEY } from '../decorators/tenant-scoped.decorator.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(OwnerEntity)
    private readonly ownersRepository: Repository<OwnerEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantsRepository: Repository<TenantEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresTenant = this.reflector.getAllAndOverride<boolean>(
      TENANT_SCOPED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiresTenant) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) return true;

    if (user.role !== UserRole.Owner) {
      this.assertRequestedTenantMatchesAccount(request, user.tenantId);
      return true;
    }

    const tenantId = this.getRequestedTenantId(request);
    const owner = await this.ownersRepository.findOne({
      where: { userId: user.id },
    });
    const tenant = owner
      ? await this.tenantsRepository.findOne({
          where: { id: tenantId, ownerId: owner.id },
        })
      : null;
    if (!tenant) {
      throw new ForbiddenException('You do not own this tenant');
    }

    request.user = { ...user, tenantId };
    return true;
  }

  private assertRequestedTenantMatchesAccount(
    request: AuthenticatedRequest,
    tenantId: string,
  ): void {
    const requestedTenantId = this.optionalRequestedTenantId(request);
    if (requestedTenantId && requestedTenantId !== tenantId) {
      throw new ForbiddenException('You cannot access another tenant');
    }
  }

  private getRequestedTenantId(request: AuthenticatedRequest): string {
    const tenantId = this.optionalRequestedTenantId(request);
    if (!tenantId) {
      throw new ForbiddenException('X-Tenant-Id header is required for owners');
    }
    return tenantId;
  }

  private optionalRequestedTenantId(
    request: AuthenticatedRequest,
  ): string | null {
    const header = request.headers['x-tenant-id'];
    const tenantId = Array.isArray(header) ? header[0] : header;
    if (!tenantId) return null;
    if (!isUUID(tenantId, '4')) {
      throw new ForbiddenException('X-Tenant-Id must be a UUID');
    }
    return tenantId;
  }
}
