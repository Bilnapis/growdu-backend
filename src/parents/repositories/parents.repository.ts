import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { StudentParentEntity } from '../../students/entities/student-parent.entity.js';
import { ParentsQueryDto } from '../dto/parent-input.dto.js';
import { ParentEntity } from '../entities/parent.entity.js';

@Injectable()
export class ParentsRepository {
  constructor(
    @InjectRepository(ParentEntity)
    private readonly repository: Repository<ParentEntity>,
    @InjectRepository(StudentParentEntity)
    private readonly relationsRepository: Repository<StudentParentEntity>,
  ) {}

  create(input: Partial<ParentEntity>): ParentEntity {
    return this.repository.create(input);
  }

  save(parent: ParentEntity): Promise<ParentEntity> {
    return this.repository.save(parent);
  }

  findById(id: string, tenantId: string): Promise<ParentEntity | null> {
    return this.repository.findOne({ where: { id, tenantId } });
  }

  findByUserId(userId: string, tenantId: string): Promise<ParentEntity | null> {
    return this.repository.findOne({ where: { userId, tenantId } });
  }

  async findPage(
    tenantId: string,
    query: ParentsQueryDto,
  ): Promise<[ParentEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('parent')
      .where('parent.tenant_id = :tenantId', { tenantId });

    if (query.search) {
      builder.andWhere(
        '(parent.name LIKE :search OR parent.phone_number LIKE :search OR parent.contact_email LIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      builder.andWhere('parent.status = :status', { status: query.status });
    }

    return builder
      .orderBy('parent.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  findAccessibleStudents(
    tenantId: string,
    parentId: string,
  ): Promise<StudentParentEntity[]> {
    return this.relationsRepository.find({
      where: {
        tenantId,
        parentId,
        accessStatus: EntityStatus.Active,
        student: { status: EntityStatus.Active },
      },
      relations: { student: true },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
  }

  findAccessibleStudent(
    tenantId: string,
    parentId: string,
    studentId: string,
  ): Promise<StudentParentEntity | null> {
    return this.relationsRepository.findOne({
      where: {
        tenantId,
        parentId,
        studentId,
        accessStatus: EntityStatus.Active,
        student: { status: EntityStatus.Active },
      },
      relations: { student: true },
    });
  }
}
