import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import platformAdminProvisionConfig from '../config/platform-admin-provision.config.js';
import { PlatformAdminEntity } from '../platform-admin/entities/platform-admin.entity.js';

@Injectable()
export class ProvisionPlatformAdminService {
  constructor(
    @InjectRepository(PlatformAdminEntity)
    private readonly platformAdminsRepository: Repository<PlatformAdminEntity>,
    private readonly passwordHashService: PasswordHashService,
    @Inject(platformAdminProvisionConfig.KEY)
    private readonly config: ConfigType<typeof platformAdminProvisionConfig>,
  ) {}

  async provision(): Promise<{ id: string; email: string }> {
    const existing = await this.platformAdminsRepository.findOne({
      where: { email: this.config.email },
    });
    if (existing) {
      throw new ConflictException('Platform admin email is already registered');
    }

    const admin = this.platformAdminsRepository.create({
      email: this.config.email,
      passwordHash: await this.passwordHashService.hash(this.config.password),
      status: EntityStatus.Active,
      lastLoginAt: null,
    });
    const saved = await this.platformAdminsRepository.save(admin);
    return { id: saved.id, email: saved.email };
  }
}
