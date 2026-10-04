import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity } from '../entities/tenant.entity.js';

@Injectable()
export class TenantsRepository {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly repository: Repository<TenantEntity>,
  ) {}

  findById(id: string): Promise<TenantEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  findActiveByOwnerUserId(userId: string): Promise<TenantEntity[]> {
    return this.repository
      .createQueryBuilder('tenant')
      .innerJoin('tenant.owner', 'owner')
      .where('owner.user_id = :userId', { userId })
      .andWhere('tenant.status = :status', { status: 'active' })
      .orderBy('tenant.name', 'ASC')
      .getMany()
  }

  save(tenant: TenantEntity): Promise<TenantEntity> {
    return this.repository.save(tenant);
  }
}
