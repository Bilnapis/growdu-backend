import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TutorsQueryDto } from '../dto/tutor-input.dto.js';
import { TutorEntity } from '../entities/tutor.entity.js';

@Injectable()
export class TutorsRepository {
  constructor(
    @InjectRepository(TutorEntity)
    private readonly repository: Repository<TutorEntity>,
  ) {}

  create(input: Partial<TutorEntity>): TutorEntity {
    return this.repository.create(input);
  }

  save(tutor: TutorEntity): Promise<TutorEntity> {
    return this.repository.save(tutor);
  }

  findById(id: string, tenantId: string): Promise<TutorEntity | null> {
    return this.repository.findOne({ where: { id, tenantId } });
  }

  findByUserId(userId: string, tenantId: string): Promise<TutorEntity | null> {
    return this.repository.findOne({ where: { userId, tenantId } });
  }

  async findPage(
    tenantId: string,
    query: TutorsQueryDto,
  ): Promise<[TutorEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('tutor')
      .where('tutor.tenant_id = :tenantId', { tenantId });

    if (query.search) {
      builder.andWhere(
        '(tutor.name LIKE :search OR tutor.phone_number LIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      builder.andWhere('tutor.status = :status', { status: query.status });
    }

    return builder
      .orderBy('tutor.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }
}
