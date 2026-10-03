import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperatorsQueryDto } from '../dto/operator-input.dto.js';
import { OperatorEntity } from '../entities/operator.entity.js';

@Injectable()
export class OperatorsRepository {
  constructor(
    @InjectRepository(OperatorEntity)
    private readonly repository: Repository<OperatorEntity>,
  ) {}

  findById(id: string, tenantId: string): Promise<OperatorEntity | null> {
    return this.repository.findOne({
      where: { id, tenantId },
      relations: { user: true },
    });
  }

  async findPage(
    tenantId: string,
    query: OperatorsQueryDto,
  ): Promise<[OperatorEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('operator')
      .innerJoinAndSelect('operator.user', 'user')
      .where('operator.tenant_id = :tenantId', { tenantId });

    if (query.search) {
      builder.andWhere(
        '(operator.name LIKE :search OR operator.phone_number LIKE :search OR user.email LIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      builder.andWhere('operator.status = :status', { status: query.status });
    }

    return builder
      .orderBy('operator.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }
}
