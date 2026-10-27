import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  createPaginationMeta,
  PaginationQueryDto,
  type PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { StudentEntity } from './entities/student.entity.js';
import {
  TutorStudentDetailResponseDto,
  TutorStudentResponseDto,
} from './dto/tutor-student-response.dto.js';

@Injectable()
export class TutorStudentsService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(
    tenantId: string,
    userId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<TutorStudentResponseDto>> {
    const builder = this.scopedQuery(tenantId, userId);

    if (query.search) {
      builder.andWhere('student.name LIKE :search', {
        search: `%${query.search}%`,
      });
    }

    const [students, total] = await builder
      .clone()
      .select([
        'student.id',
        'student.name',
        'student.school',
        'student.educationLevel',
      ])
      .distinct(true)
      .orderBy('student.name', 'ASC')
      .addOrderBy('student.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const groups = students.length
      ? await builder
          .select('student.id', 'studentId')
          .addSelect('study_group.id', 'id')
          .addSelect('study_group.name', 'name')
          .distinct(true)
          .andWhere('student.id IN (:...studentIds)', {
            studentIds: students.map((student) => student.id),
          })
          .orderBy('study_group.name', 'ASC')
          .getRawMany<{ studentId: string; id: string; name: string }>()
      : [];

    return {
      data: students.map((student) => ({
        id: student.id,
        name: student.name,
        school: student.school,
        educationLevel: student.educationLevel,
        studyGroups: groups
          .filter((group) => group.studentId === student.id)
          .map(({ id, name }) => ({ id, name })),
      })),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<TutorStudentDetailResponseDto> {
    const builder = this.scopedQuery(tenantId, userId).andWhere(
      'student.id = :id',
      { id },
    );
    const student = await builder
      .clone()
      .select([
        'student.id',
        'student.name',
        'student.school',
        'student.educationLevel',
        'student.gender',
      ])
      .getOne();
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    const studyGroups = await builder
      .select('study_group.id', 'id')
      .addSelect('study_group.name', 'name')
      .distinct(true)
      .orderBy('study_group.name', 'ASC')
      .getRawMany<{ id: string; name: string }>();
    return {
      id: student.id,
      name: student.name,
      school: student.school,
      educationLevel: student.educationLevel,
      gender: student.gender,
      studyGroups,
    };
  }

  private scopedQuery(tenantId: string, userId: string) {
    return this.dataSource
      .getRepository(StudentEntity)
      .createQueryBuilder('student')
      .innerJoin(
        'study_group_students',
        'membership',
        'membership.student_id = student.id AND membership.tenant_id = student.tenant_id',
      )
      .innerJoin(
        'study_groups',
        'study_group',
        'study_group.id = membership.study_group_id AND study_group.tenant_id = student.tenant_id AND study_group.status = :active',
      )
      .innerJoin(
        'study_group_schedules',
        'schedule',
        `schedule.study_group_id = study_group.id
         AND schedule.tenant_id = student.tenant_id
         AND schedule.configuration_id = membership.configuration_id
         AND schedule.configuration_id = (
           SELECT c.id FROM study_group_configurations c
           WHERE c.study_group_id = study_group.id AND c.superseded_at IS NULL
           ORDER BY c.effective_from DESC, c.created_at DESC LIMIT 1
         )`,
      )
      .innerJoin(
        'tutors',
        'tutor',
        'tutor.id = schedule.tutor_id AND tutor.tenant_id = student.tenant_id AND tutor.user_id = :userId AND tutor.status = :active',
      )
      .where('student.tenant_id = :tenantId AND student.status = :active', {
        tenantId,
        userId,
        active: EntityStatus.Active,
      });
  }
}
