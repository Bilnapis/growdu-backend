import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity.js';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { isDuplicateEntryError } from '../common/database/database-error.util.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import { OwnersService } from '../owners/owners.service.js';
import { UserEntity, UserRole } from '../users/entities/user.entity.js';
import {
  CreateOperatorDto,
  OperatorsQueryDto,
  UpdateOperatorDto,
} from './dto/operator-input.dto.js';
import { OperatorResponseDto } from './dto/operator-response.dto.js';
import { OperatorEntity } from './entities/operator.entity.js';
import { OperatorsRepository } from './repositories/operators.repository.js';

@Injectable()
export class OperatorsService {
  constructor(
    private readonly operatorsRepository: OperatorsRepository,
    private readonly ownersService: OwnersService,
    private readonly passwordHashService: PasswordHashService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(
    ownerUserId: string,
    tenantId: string,
    query: OperatorsQueryDto,
  ): Promise<PaginatedResponse<OperatorResponseDto>> {
    await this.ownersService.assertOwnsTenant(ownerUserId, tenantId);
    const [operators, total] = await this.operatorsRepository.findPage(
      tenantId,
      query,
    );
    return {
      data: operators.map(OperatorResponseDto.fromEntity),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(
    ownerUserId: string,
    tenantId: string,
    id: string,
  ): Promise<OperatorResponseDto> {
    await this.ownersService.assertOwnsTenant(ownerUserId, tenantId);
    return OperatorResponseDto.fromEntity(await this.findEntity(tenantId, id));
  }

  async create(
    ownerUserId: string,
    tenantId: string,
    dto: CreateOperatorDto,
  ): Promise<OperatorResponseDto> {
    await this.ownersService.assertOwnsTenant(ownerUserId, tenantId);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(UserEntity, {
          where: { email: dto.email },
        });
        if (existing) {
          throw new ConflictException('Email is already registered');
        }

        const status = dto.status ?? EntityStatus.Active;
        const user = manager.create(UserEntity, {
          tenantId,
          email: dto.email,
          passwordHash: await this.passwordHashService.hash(dto.password),
          role: UserRole.Operator,
          status,
          lastLoginAt: null,
        });
        const savedUser = await manager.save(user);
        const operator = manager.create(OperatorEntity, {
          tenantId,
          userId: savedUser.id,
          name: dto.name,
          phoneNumber: dto.phoneNumber,
          status,
        });
        const savedOperator = await manager.save(operator);
        savedOperator.user = savedUser;
        return OperatorResponseDto.fromEntity(savedOperator);
      });
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Email or operator account already exists');
      }
      throw error;
    }
  }

  async update(
    ownerUserId: string,
    tenantId: string,
    id: string,
    dto: UpdateOperatorDto,
  ): Promise<OperatorResponseDto> {
    await this.ownersService.assertOwnsTenant(ownerUserId, tenantId);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const operator = await manager.findOne(OperatorEntity, {
          where: { id, tenantId },
          relations: { user: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (!operator) throw new NotFoundException('Operator not found');

        if (dto.name !== undefined) operator.name = dto.name;
        if (dto.phoneNumber !== undefined)
          operator.phoneNumber = dto.phoneNumber;
        if (dto.status !== undefined) {
          operator.status = dto.status;
          operator.user.status = dto.status;
        }
        if (dto.email !== undefined) operator.user.email = dto.email;

        const savedUser = await manager.save(operator.user);
        const savedOperator = await manager.save(operator);
        if (dto.status === EntityStatus.Inactive) {
          await manager
            .createQueryBuilder()
            .update(AuthSessionEntity)
            .set({ revokedAt: new Date() })
            .where('user_id = :userId', { userId: savedUser.id })
            .andWhere('revoked_at IS NULL')
            .execute();
        }
        savedOperator.user = savedUser;
        return OperatorResponseDto.fromEntity(savedOperator);
      });
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async remove(
    ownerUserId: string,
    tenantId: string,
    id: string,
  ): Promise<void> {
    await this.ownersService.assertOwnsTenant(ownerUserId, tenantId);
    await this.dataSource.transaction(async (manager) => {
      const operator = await manager.findOne(OperatorEntity, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!operator) throw new NotFoundException('Operator not found');
      await manager.delete(OperatorEntity, { id: operator.id });
      await manager.delete(UserEntity, { id: operator.userId });
    });
  }

  private async findEntity(
    tenantId: string,
    id: string,
  ): Promise<OperatorEntity> {
    const operator = await this.operatorsRepository.findById(id, tenantId);
    if (!operator) throw new NotFoundException('Operator not found');
    return operator;
  }
}
