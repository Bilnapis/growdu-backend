import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity.js';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { isDuplicateEntryError } from '../common/database/database-error.util.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UsersQueryDto,
} from './dto/user-input.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UserEntity, UserRole } from './entities/user.entity.js';
import { UsersRepository } from './repositories/users.repository.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordHashService: PasswordHashService,
    @InjectRepository(AuthSessionEntity)
    private readonly sessionsRepository: Repository<AuthSessionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(
    tenantId: string,
    query: UsersQueryDto,
  ): Promise<PaginatedResponse<UserResponseDto>> {
    const [users, total] = await this.usersRepository.findPage(tenantId, query);
    return {
      data: users.map(UserResponseDto.fromEntity),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(tenantId: string, id: string): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.findEntity(tenantId, id));
  }

  async create(tenantId: string, dto: CreateUserDto): Promise<UserResponseDto> {
    void tenantId;
    void dto;
    throw new BadRequestException(
      'Create operators through POST /tenants/:tenantId/operators. Owners are provisioned separately.',
    );
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const tenant = await manager.findOne(TenantEntity, {
          where: { id: tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!tenant) throw new NotFoundException('User not found');

        const user = await manager.findOne(UserEntity, {
          where: { id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('User not found');

        if (
          dto.status === EntityStatus.Inactive &&
          user.status === EntityStatus.Active &&
          user.role === UserRole.Owner &&
          (await manager.count(UserEntity, {
            where: {
              tenantId,
              role: UserRole.Owner,
              status: EntityStatus.Active,
            },
          })) <= 1
        ) {
          throw new ConflictException(
            'The last active owner cannot be deactivated',
          );
        }

        if (dto.email !== undefined) user.email = dto.email;
        if (dto.status !== undefined) user.status = dto.status;
        const updated = await manager.save(user);

        if (dto.status === EntityStatus.Inactive) {
          await manager
            .createQueryBuilder()
            .update(AuthSessionEntity)
            .set({ revokedAt: new Date() })
            .where('user_id = :userId', { userId: id })
            .andWhere('revoked_at IS NULL')
            .execute();
        }
        return updated;
      });
      return UserResponseDto.fromEntity(saved);
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async resetPassword(
    tenantId: string,
    id: string,
    dto: ResetPasswordDto,
  ): Promise<void> {
    const user = await this.findEntity(tenantId, id);
    user.passwordHash = await this.passwordHashService.hash(dto.password);
    await this.usersRepository.save(user);
    await this.revokeAllSessions(id);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.sessionsRepository
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }

  findForAuthenticationByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepository.findByEmailWithPassword(email);
  }

  findForAuthenticationById(id: string): Promise<UserEntity | null> {
    return this.usersRepository.findByIdWithTenant(id);
  }

  findWithPassword(id: string): Promise<UserEntity | null> {
    return this.usersRepository.findByIdWithPassword(id);
  }

  saveEntity(user: UserEntity): Promise<UserEntity> {
    return this.usersRepository.save(user);
  }

  private async findEntity(tenantId: string, id: string): Promise<UserEntity> {
    const user = await this.usersRepository.findByIdForTenant(id, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
