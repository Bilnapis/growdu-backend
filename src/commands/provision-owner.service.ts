import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import provisionConfig from '../config/provision.config.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { UserEntity, UserRole } from '../users/entities/user.entity.js';

export interface ProvisionOwnerResult {
  tenantId: string;
  ownerId: string;
  ownerEmail: string;
}

@Injectable()
export class ProvisionOwnerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly passwordHashService: PasswordHashService,
    @Inject(provisionConfig.KEY)
    private readonly config: ConfigType<typeof provisionConfig>,
  ) {}

  provision(): Promise<ProvisionOwnerResult> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(UserEntity, {
        where: { email: this.config.ownerEmail },
      });
      if (existing) {
        throw new ConflictException('Owner email is already registered');
      }

      const tenant = manager.create(TenantEntity, {
        name: this.config.tenantName.trim(),
        address: null,
        whatsappNumber: null,
        email: null,
        logoUrl: null,
        status: EntityStatus.Active,
      });
      const savedTenant = await manager.save(tenant);

      const owner = manager.create(UserEntity, {
        tenantId: savedTenant.id,
        email: this.config.ownerEmail,
        passwordHash: await this.passwordHashService.hash(
          this.config.ownerPassword,
        ),
        role: UserRole.Owner,
        status: EntityStatus.Active,
        lastLoginAt: null,
      });
      const savedOwner = await manager.save(owner);

      return {
        tenantId: savedTenant.id,
        ownerId: savedOwner.id,
        ownerEmail: savedOwner.email,
      };
    });
  }
}
