import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { OwnerEntity } from '../owners/entities/owner.entity.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import {
  PlatformAdminCreateTenantDto,
  PlatformAdminTenantsQueryDto,
  PlatformAdminUpdateTenantDto,
} from './dto/platform-admin-tenants.dto.js';
import {
  PlatformAdminOwnerResponseDto,
  PlatformAdminTenantManagementResponseDto,
} from './dto/platform-admin-tenant-management-response.dto.js';

@Injectable()
export class PlatformAdminTenantsService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantsRepository: Repository<TenantEntity>,
    @InjectRepository(OwnerEntity)
    private readonly ownersRepository: Repository<OwnerEntity>,
  ) {}

  async findAll(
    query: PlatformAdminTenantsQueryDto,
  ): Promise<PaginatedResponse<PlatformAdminTenantManagementResponseDto>> {
    const builder = this.tenantsRepository
      .createQueryBuilder('tenant')
      .leftJoinAndSelect('tenant.owner', 'owner')
      .leftJoinAndSelect('owner.user', 'ownerUser');

    if (query.search) {
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('tenant.name LIKE :search', { search: `%${query.search}%` })
            .orWhere('tenant.email LIKE :search', { search: `%${query.search}%` })
            .orWhere('owner.name LIKE :search', { search: `%${query.search}%` })
            .orWhere('ownerUser.email LIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }
    if (query.status) {
      builder.andWhere('tenant.status = :status', { status: query.status });
    }

    const [tenants, total] = await builder
      .orderBy('tenant.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      data: tenants.map(PlatformAdminTenantManagementResponseDto.fromEntity),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async findActiveOwners(): Promise<PlatformAdminOwnerResponseDto[]> {
    const owners = await this.ownersRepository.find({
      where: { status: EntityStatus.Active, user: { status: EntityStatus.Active } },
      relations: { user: true },
      order: { name: 'ASC' },
    });
    return owners.map(PlatformAdminOwnerResponseDto.fromEntity);
  }

  async create(
    dto: PlatformAdminCreateTenantDto,
  ): Promise<PlatformAdminTenantManagementResponseDto> {
    const owner = await this.findActiveOwner(dto.ownerId);
    const tenant = this.tenantsRepository.create({
      ownerId: owner.id,
      name: dto.name,
      address: dto.address ?? null,
      whatsappNumber: dto.whatsappNumber ?? null,
      email: dto.email ?? null,
      logoUrl: dto.logoUrl ?? null,
      status: dto.status ?? EntityStatus.Active,
    });
    const savedTenant = await this.tenantsRepository.save(tenant);
    savedTenant.owner = owner;
    return PlatformAdminTenantManagementResponseDto.fromEntity(savedTenant);
  }

  async update(
    id: string,
    dto: PlatformAdminUpdateTenantDto,
  ): Promise<PlatformAdminTenantManagementResponseDto> {
    const tenant = await this.tenantsRepository.findOne({
      where: { id },
      relations: { owner: { user: true } },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (dto.ownerId !== undefined) {
      const owner = await this.findActiveOwner(dto.ownerId);
      tenant.ownerId = owner.id;
      tenant.owner = owner;
    }
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.address !== undefined) tenant.address = dto.address;
    if (dto.whatsappNumber !== undefined) tenant.whatsappNumber = dto.whatsappNumber;
    if (dto.email !== undefined) tenant.email = dto.email;
    if (dto.logoUrl !== undefined) tenant.logoUrl = dto.logoUrl;
    if (dto.status !== undefined) tenant.status = dto.status;

    const savedTenant = await this.tenantsRepository.save(tenant);
    return PlatformAdminTenantManagementResponseDto.fromEntity(savedTenant);
  }

  private async findActiveOwner(ownerId: string): Promise<OwnerEntity> {
    const owner = await this.ownersRepository.findOne({
      where: { id: ownerId, status: EntityStatus.Active, user: { status: EntityStatus.Active } },
      relations: { user: true },
    });
    if (!owner) throw new NotFoundException('Active owner not found');
    return owner;
  }
}
