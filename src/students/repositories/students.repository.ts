import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StudentsQueryDto } from '../dto/student-input.dto.js';
import { StudentParentEntity } from '../entities/student-parent.entity.js';
import { StudentEntity } from '../entities/student.entity.js';

export type StudentsSummary = {
  active: number;
  inactive: number;
  missingParentContact: number;
  withoutGroup: number;
};

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
        `(
          student.student_code LIKE :search
          OR student.name LIKE :search
          OR student.school LIKE :search
          OR EXISTS (
            SELECT 1
            FROM student_parents search_relation
            INNER JOIN parents search_parent ON search_parent.id = search_relation.parent_id
            WHERE search_relation.student_id = student.id
              AND search_relation.tenant_id = :tenantId
              AND search_parent.tenant_id = :tenantId
              AND (
                search_parent.name LIKE :search
                OR search_parent.phone_number LIKE :search
                OR search_parent.contact_email LIKE :search
              )
          )
        )`,
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
    if (query.educationStage) {
      builder.andWhere('student.education_level LIKE :educationStage', {
        educationStage: `${query.educationStage}%`,
      });
    }

    return builder
      .orderBy('student.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  findPrimaryParentRelations(
    tenantId: string,
    studentIds: string[],
  ): Promise<StudentParentEntity[]> {
    if (studentIds.length === 0) return Promise.resolve([]);

    return this.relationsRepository.find({
      where: {
        tenantId,
        studentId: In(studentIds),
        isPrimary: true,
      },
      relations: { parent: true },
    });
  }

  async getSummary(tenantId: string): Promise<StudentsSummary> {
    const raw = await this.repository
      .createQueryBuilder('student')
      .leftJoin(
        StudentParentEntity,
        'primary_relation',
        'primary_relation.student_id = student.id AND primary_relation.tenant_id = student.tenant_id AND primary_relation.is_primary = true',
      )
      .leftJoin(
        'parents',
        'primary_parent',
        'primary_parent.id = primary_relation.parent_id AND primary_parent.tenant_id = student.tenant_id',
      )
      .select(
        "COUNT(DISTINCT CASE WHEN student.status = 'active' THEN student.id END)",
        'active',
      )
      .addSelect(
        "COUNT(DISTINCT CASE WHEN student.status = 'inactive' THEN student.id END)",
        'inactive',
      )
      .addSelect(
        "COUNT(DISTINCT CASE WHEN primary_parent.id IS NULL OR primary_parent.contact_email = '' THEN student.id END)",
        'missingParentContact',
      )
      .addSelect(
        "COUNT(DISTINCT CASE WHEN student.status = 'active' AND NOT EXISTS (SELECT 1 FROM study_group_students group_student INNER JOIN study_groups study_group ON study_group.id = group_student.study_group_id AND study_group.status = 'active' WHERE group_student.tenant_id = student.tenant_id AND group_student.student_id = student.id) THEN student.id END)",
        'withoutGroup',
      )
      .where('student.tenant_id = :tenantId', { tenantId })
      .getRawOne<{
        active: string;
        inactive: string;
        missingParentContact: string;
        withoutGroup: string;
      }>();

    const active = Number(raw?.active ?? 0);
    return {
      active,
      inactive: Number(raw?.inactive ?? 0),
      missingParentContact: Number(raw?.missingParentContact ?? 0),
      withoutGroup: Number(raw?.withoutGroup ?? 0),
    };
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
