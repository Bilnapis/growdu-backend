import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersQueryDto } from '../dto/user-input.dto.js';
import { UserEntity } from '../entities/user.entity.js';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  create(input: Partial<UserEntity>): UserEntity {
    return this.repository.create(input);
  }

  save(user: UserEntity): Promise<UserEntity> {
    return this.repository.save(user);
  }

  findByIdForTenant(id: string, tenantId: string): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { id, tenantId } });
  }

  findByIdWithTenant(id: string): Promise<UserEntity | null> {
    return this.repository.findOne({
      where: { id },
      relations: { tenant: true },
    });
  }

  findByEmailWithPassword(email: string): Promise<UserEntity | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.tenant', 'tenant')
      .where('user.email = :email', { email })
      .getOne();
  }

  findByIdWithPassword(
    id: string,
    tenantId: string,
  ): Promise<UserEntity | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .andWhere('user.tenant_id = :tenantId', { tenantId })
      .getOne();
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { email } });
  }

  async findPage(
    tenantId: string,
    query: UsersQueryDto,
  ): Promise<[UserEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('user')
      .where('user.tenant_id = :tenantId', { tenantId });

    if (query.search) {
      builder.andWhere('user.email LIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.role) {
      builder.andWhere('user.role = :role', { role: query.role });
    }
    if (query.status) {
      builder.andWhere('user.status = :status', { status: query.status });
    }

    return builder
      .orderBy('user.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }
}
