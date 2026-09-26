import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentsQueryDto } from '../dto/student-input.dto.js';
import { StudentParentEntity } from '../entities/student-parent.entity.js';
import { StudentEntity } from '../entities/student.entity.js';

@Injectable()
export class StudentsRepository {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly repository: Repository<StudentEntity>,
    @InjectRepository(StudentParentEntity)
    private readonly relationsRepository: Repository<StudentParentEntity>,
  ) {}

  create(input: Partial<StudentEntity>): StudentEntity {
    return this.repository.create(input);
  }

  save(student: StudentEntity): Promise<StudentEntity> {
    return this.repository.save(student);
  }

  findById(id: string, tenantId: string): Promise<StudentEntity | null> {
    return this.repository.findOne({ where: { id, tenantId } });
  }

  async findPage(
    tenantId: string,
    query: StudentsQueryDto,
  ): Promise<[StudentEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('student')
      .where('student.tenant_id = :tenantId', { tenantId });

    if (query.search) {
      builder.andWhere(
        '(student.student_code LIKE :search OR student.name LIKE :search OR student.school LIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      builder.andWhere('student.status = :status', { status: query.status });
    }
    if (query.gender) {
      builder.andWhere('student.gender = :gender', { gender: query.gender });
    }
    if (query.educationLevel) {
      builder.andWhere('student.education_level = :educationLevel', {
        educationLevel: query.educationLevel,
      });
    }

    return builder
      .orderBy('student.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  findParentRelations(
    tenantId: string,
    studentId: string,
  ): Promise<StudentParentEntity[]> {
    return this.relationsRepository.find({
      where: { tenantId, studentId },
      relations: { parent: true },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
  }
}
