import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity.js';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { isDuplicateEntryError } from '../common/database/database-error.util.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { OwnerEntity } from '../owners/entities/owner.entity.js';
import { OperatorEntity } from '../operators/entities/operator.entity.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { UserEntity, UserRole } from '../users/entities/user.entity.js';
import {
  PlatformAdminCreateUserDto,
  PlatformAdminResetUserPasswordDto,
  PlatformAdminUpdateUserDto,
  PlatformAdminUsersQueryDto,
} from './dto/platform-admin-users.dto.js';
import { PlatformAdminTenantResponseDto } from './dto/platform-admin-tenant-response.dto.js';
import {
  PlatformAdminUserDetailResponseDto,
  PlatformAdminUserProfile,
  PlatformAdminUserResponseDto,
} from './dto/platform-admin-user-response.dto.js';

@Injectable()
export class PlatformAdminUsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(AuthSessionEntity)
    private readonly sessionsRepository: Repository<AuthSessionEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantsRepository: Repository<TenantEntity>,
    private readonly dataSource: DataSource,
    private readonly passwordHashService: PasswordHashService,
  ) {}

  async findAll(
    query: PlatformAdminUsersQueryDto,
  ): Promise<PaginatedResponse<PlatformAdminUserResponseDto>> {
    const builder = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.tenant', 'tenant');

    if (query.search) {
      builder.andWhere('user.email LIKE :search', { search: `%${query.search}%` });
    }
    if (query.role) builder.andWhere('user.role = :role', { role: query.role });
    if (query.status) {
      builder.andWhere('user.status = :status', { status: query.status });
    }

    const [users, total] = await builder
      .orderBy('user.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      data: users.map(PlatformAdminUserResponseDto.fromEntity),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async update(
    id: string,
    dto: PlatformAdminUpdateUserDto,
  ): Promise<PlatformAdminUserDetailResponseDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(UserEntity, {
          where: { id },
          relations: { tenant: true },
        });
        if (!user) throw new NotFoundException('User not found');

        const tenant = await this.resolveUpdatedTenant(manager, user, dto);
        if (dto.email !== undefined) user.email = dto.email;
        if (dto.status !== undefined) user.status = dto.status;
        if (dto.password !== undefined) {
          user.passwordHash = await this.passwordHashService.hash(dto.password);
        }
        user.tenantId = tenant?.id ?? null;
        user.tenant = tenant;
        const savedUser = await manager.save(user);
        const profile = await this.updateProfile(
          manager,
          savedUser,
          dto,
          tenant,
        );
        const ownedTenants = await this.findOwnedTenants(
          manager,
          savedUser,
          profile,
        );

        if (dto.status === EntityStatus.Inactive || dto.password !== undefined) {
          await manager
            .createQueryBuilder()
            .update(AuthSessionEntity)
            .set({ revokedAt: new Date() })
            .where('user_id = :userId', { userId: savedUser.id })
            .andWhere('revoked_at IS NULL')
            .execute();
        }
        return PlatformAdminUserDetailResponseDto.fromUserAndProfile(
          savedUser,
          profile,
          ownedTenants,
        );
      });
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async findOne(id: string): Promise<PlatformAdminUserDetailResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { tenant: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const profile = await this.findProfile(this.dataSource.manager, user);
    const ownedTenants = await this.findOwnedTenants(
      this.dataSource.manager,
      user,
      profile,
    );
    return PlatformAdminUserDetailResponseDto.fromUserAndProfile(
      user,
      profile,
      ownedTenants,
    );
  }

  async create(
    dto: PlatformAdminCreateUserDto,
  ): Promise<PlatformAdminUserResponseDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(UserEntity, {
          where: { email: dto.email },
        });
        if (existing) throw new ConflictException('Email is already registered');

        const tenant = dto.tenantId
          ? await manager.findOne(TenantEntity, {
              where: { id: dto.tenantId, status: EntityStatus.Active },
            })
          : null;
        if (dto.role !== UserRole.Owner && !tenant) {
          throw new NotFoundException('Active tenant not found');
        }

        const user = manager.create(UserEntity, {
          tenantId: tenant?.id ?? null,
          email: dto.email,
          passwordHash: await this.passwordHashService.hash(dto.password),
          role: dto.role,
          status: EntityStatus.Active,
          lastLoginAt: null,
        });
        const savedUser = await manager.save(user);

        if (dto.role === UserRole.Owner) {
          await manager.save(
            manager.create(OwnerEntity, {
              userId: savedUser.id,
              name: dto.name,
              phoneNumber: dto.phoneNumber,
              status: EntityStatus.Active,
            }),
          );
        }
        if (dto.role === UserRole.Operator && tenant) {
          await manager.save(
            manager.create(OperatorEntity, {
              tenantId: tenant.id,
              userId: savedUser.id,
              name: dto.name,
              phoneNumber: dto.phoneNumber,
              status: EntityStatus.Active,
            }),
          );
        }
        if (dto.role === UserRole.Tutor && tenant) {
          await manager.save(
            manager.create(TutorEntity, {
              tenantId: tenant.id,
              userId: savedUser.id,
              name: dto.name,
              phoneNumber: dto.phoneNumber,
              sessionRate: this.normalizeRate(dto.sessionRate ?? ''),
              status: EntityStatus.Active,
            }),
          );
        }
        if (dto.role === UserRole.Parent && tenant) {
          await manager.save(
            manager.create(ParentEntity, {
              tenantId: tenant.id,
              userId: savedUser.id,
              name: dto.name,
              phoneNumber: dto.phoneNumber,
              contactEmail: dto.email,
              status: EntityStatus.Active,
            }),
          );
        }

        savedUser.tenant = tenant;
        return PlatformAdminUserResponseDto.fromEntity(savedUser);
      });
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async findActiveTenants(): Promise<PlatformAdminTenantResponseDto[]> {
    const tenants = await this.tenantsRepository.find({
      where: { status: EntityStatus.Active },
      order: { name: 'ASC' },
    });
    return tenants.map(PlatformAdminTenantResponseDto.fromEntity);
  }

  async resetPassword(
    id: string,
    dto: PlatformAdminResetUserPasswordDto,
  ): Promise<void> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException('User not found');

    user.passwordHash = await this.passwordHashService.hash(dto.password);
    await this.usersRepository.save(user);
    await this.revokeAllSessions(user.id);
  }

  private async revokeAllSessions(userId: string): Promise<void> {
    await this.sessionsRepository
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }

  private async resolveUpdatedTenant(
    manager: EntityManager,
    user: UserEntity,
    dto: PlatformAdminUpdateUserDto,
  ): Promise<TenantEntity | null> {
    if (user.role === UserRole.Owner) return null;
    if (dto.tenantId === undefined) return user.tenant;

    const tenant = await manager.findOne(TenantEntity, {
      where: { id: dto.tenantId, status: EntityStatus.Active },
    });
    if (!tenant) throw new NotFoundException('Active tenant not found');
    return tenant;
  }

  private async findProfile(
    manager: EntityManager,
    user: UserEntity,
  ): Promise<PlatformAdminUserProfile> {
    if (user.role === UserRole.Owner) {
      const profile = await manager.findOneBy(OwnerEntity, { userId: user.id });
      if (!profile) throw new NotFoundException('Owner profile not found');
      return profile;
    }
    if (user.role === UserRole.Operator) {
      const profile = await manager.findOneBy(OperatorEntity, { userId: user.id });
      if (!profile) throw new NotFoundException('Operator profile not found');
      return profile;
    }
    if (user.role === UserRole.Tutor) {
      const profile = await manager.findOneBy(TutorEntity, { userId: user.id });
      if (!profile) throw new NotFoundException('Tutor profile not found');
      return profile;
    }
    const profile = await manager.findOneBy(ParentEntity, { userId: user.id });
    if (!profile) throw new NotFoundException('Parent profile not found');
    return profile;
  }

  private async updateProfile(
    manager: EntityManager,
    user: UserEntity,
    dto: PlatformAdminUpdateUserDto,
    tenant: TenantEntity | null,
  ): Promise<PlatformAdminUserProfile> {
    if (user.role === UserRole.Owner) {
      const profile = await manager.findOneBy(OwnerEntity, { userId: user.id });
      if (!profile) throw new NotFoundException('Owner profile not found');
      if (dto.name !== undefined) profile.name = dto.name;
      if (dto.phoneNumber !== undefined) profile.phoneNumber = dto.phoneNumber;
      return manager.save(profile);
    }
    if (!tenant) throw new NotFoundException('Active tenant not found');
    if (user.role === UserRole.Operator) {
      const profile = await manager.findOneBy(OperatorEntity, { userId: user.id });
      if (!profile) throw new NotFoundException('Operator profile not found');
      profile.tenantId = tenant.id;
      if (dto.name !== undefined) profile.name = dto.name;
      if (dto.phoneNumber !== undefined) profile.phoneNumber = dto.phoneNumber;
      return manager.save(profile);
    }
    if (user.role === UserRole.Tutor) {
      const profile = await manager.findOneBy(TutorEntity, { userId: user.id });
      if (!profile) throw new NotFoundException('Tutor profile not found');
      profile.tenantId = tenant.id;
      if (dto.name !== undefined) profile.name = dto.name;
      if (dto.phoneNumber !== undefined) profile.phoneNumber = dto.phoneNumber;
      if (dto.sessionRate !== undefined) {
        profile.sessionRate = this.normalizeRate(dto.sessionRate);
      }
      return manager.save(profile);
    }
    const profile = await manager.findOneBy(ParentEntity, { userId: user.id });
    if (!profile) throw new NotFoundException('Parent profile not found');
    profile.tenantId = tenant.id;
    if (dto.name !== undefined) profile.name = dto.name;
    if (dto.phoneNumber !== undefined) profile.phoneNumber = dto.phoneNumber;
    if (dto.email !== undefined) profile.contactEmail = dto.email;
    return manager.save(profile);
  }

  private async findOwnedTenants(
    manager: EntityManager,
    user: UserEntity,
    profile: PlatformAdminUserProfile,
  ): Promise<PlatformAdminTenantResponseDto[]> {
    if (user.role !== UserRole.Owner) return [];

    const tenants = await manager.find(TenantEntity, {
      where: { ownerId: profile.id },
      order: { createdAt: 'DESC' },
    });
    return tenants.map(PlatformAdminTenantResponseDto.fromEntity);
  }

  private normalizeRate(value: string): string {
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) {
      throw new ConflictException('Tutor session rate is invalid');
    }
    const [integer, fraction = ''] = value.split('.');
    return `${integer}.${fraction.padEnd(2, '0')}`;
  }
}
