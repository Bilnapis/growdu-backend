import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { TenantResponseDto } from '../tenants/dto/tenant-response.dto.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { CreateOwnedTenantDto, UpdateOwnerDto } from './dto/owner-input.dto.js';
import { OwnerResponseDto } from './dto/owner-response.dto.js';
import { OwnerEntity } from './entities/owner.entity.js';

@Injectable()
export class OwnersService {
  constructor(
    @InjectRepository(OwnerEntity)
    private readonly ownersRepository: Repository<OwnerEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantsRepository: Repository<TenantEntity>,
  ) {}

  async findMe(userId: string): Promise<OwnerResponseDto> {
    return OwnerResponseDto.fromEntity(await this.findEntityByUserId(userId));
  }

  async updateMe(
    userId: string,
    dto: UpdateOwnerDto,
  ): Promise<OwnerResponseDto> {
    const owner = await this.findEntityByUserId(userId);
    if (dto.name !== undefined) owner.name = dto.name;
    if (dto.phoneNumber !== undefined) owner.phoneNumber = dto.phoneNumber;
    return OwnerResponseDto.fromEntity(await this.ownersRepository.save(owner));
  }

  async findMyTenants(userId: string): Promise<TenantResponseDto[]> {
    const owner = await this.findEntityByUserId(userId);
    const tenants = await this.tenantsRepository.find({
      where: { ownerId: owner.id },
      order: { createdAt: 'DESC' },
    });
    return tenants.map(TenantResponseDto.fromEntity);
  }

  async createTenant(
    userId: string,
    dto: CreateOwnedTenantDto,
  ): Promise<TenantResponseDto> {
    const owner = await this.findEntityByUserId(userId);
    const tenant = this.tenantsRepository.create({
      ownerId: owner.id,
      name: dto.name,
      address: dto.address ?? null,
      whatsappNumber: dto.whatsappNumber ?? null,
      email: dto.email ?? null,
      logoUrl: dto.logoUrl ?? null,
      status: dto.status ?? EntityStatus.Active,
    });
    return TenantResponseDto.fromEntity(
      await this.tenantsRepository.save(tenant),
    );
  }

  async assertOwnsTenant(
    userId: string,
    tenantId: string,
  ): Promise<OwnerEntity> {
    const owner = await this.findEntityByUserId(userId);
    const tenant = await this.tenantsRepository.findOne({
      where: { id: tenantId, ownerId: owner.id },
    });
    if (!tenant) {
      throw new ForbiddenException('You do not own this tenant');
    }
    return owner;
  }

  private async findEntityByUserId(userId: string): Promise<OwnerEntity> {
    const owner = await this.ownersRepository.findOne({ where: { userId } });
    if (!owner) {
      throw new NotFoundException('Owner profile not found');
    }
    if (owner.status !== EntityStatus.Active) {
      throw new ForbiddenException('Owner profile is inactive');
    }
    return owner;
  }
}
