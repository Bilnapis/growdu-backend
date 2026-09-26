import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { isDuplicateEntryError } from '../common/database/database-error.util.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import {
  CreateStudentDto,
  StudentsQueryDto,
  UpdateStudentDto,
} from './dto/student-input.dto.js';
import {
  AddStudentParentDto,
  UpdateStudentParentDto,
} from './dto/student-parent-input.dto.js';
import {
  StudentParentResponseDto,
  StudentResponseDto,
} from './dto/student-response.dto.js';
import { StudentParentEntity } from './entities/student-parent.entity.js';
import { StudentEntity } from './entities/student.entity.js';
import { StudentsRepository } from './repositories/students.repository.js';

@Injectable()
export class StudentsService {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(
    tenantId: string,
    query: StudentsQueryDto,
  ): Promise<PaginatedResponse<StudentResponseDto>> {
    const [students, total] = await this.studentsRepository.findPage(
      tenantId,
      query,
    );
    return {
      data: students.map(StudentResponseDto.fromEntity),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(tenantId: string, id: string): Promise<StudentResponseDto> {
    return StudentResponseDto.fromEntity(await this.findEntity(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateStudentDto,
  ): Promise<StudentResponseDto> {
    const student = this.studentsRepository.create({
      tenantId,
      studentCode: dto.studentCode,
      name: dto.name,
      gender: dto.gender,
      educationLevel: dto.educationLevel,
      school: dto.school,
      phoneNumber: dto.phoneNumber ?? null,
      address: dto.address,
      status: dto.status ?? EntityStatus.Active,
    });
    try {
      return StudentResponseDto.fromEntity(
        await this.studentsRepository.save(student),
      );
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          'Student code is already used by this tenant',
        );
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateStudentDto,
  ): Promise<StudentResponseDto> {
    const student = await this.findEntity(tenantId, id);
    Object.assign(student, dto);
    try {
      return StudentResponseDto.fromEntity(
        await this.studentsRepository.save(student),
      );
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          'Student code is already used by this tenant',
        );
      }
      throw error;
    }
  }

  async findParents(
    tenantId: string,
    studentId: string,
  ): Promise<StudentParentResponseDto[]> {
    await this.findEntity(tenantId, studentId);
    const relations = await this.studentsRepository.findParentRelations(
      tenantId,
      studentId,
    );
    return relations.map(StudentParentResponseDto.fromEntity);
  }

  async addParent(
    tenantId: string,
    studentId: string,
    dto: AddStudentParentDto,
  ): Promise<StudentParentResponseDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.requireStudentAndParent(
          manager,
          tenantId,
          studentId,
          dto.parentId,
        );

        const existing = await manager.findOne(StudentParentEntity, {
          where: { tenantId, studentId, parentId: dto.parentId },
        });
        if (existing) {
          throw new ConflictException(
            'Parent is already linked to this student',
          );
        }

        if (dto.isPrimary) {
          await this.clearPrimary(manager, tenantId, studentId);
        }

        const relation = manager.create(StudentParentEntity, {
          tenantId,
          studentId,
          parentId: dto.parentId,
          relationship: dto.relationship,
          isPrimary: dto.isPrimary ?? false,
          accessStatus: dto.accessStatus ?? EntityStatus.Active,
        });
        await manager.save(relation);
        return this.loadRelation(manager, tenantId, studentId, dto.parentId);
      });
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Parent is already linked to this student');
      }
      throw error;
    }
  }

  async updateParent(
    tenantId: string,
    studentId: string,
    parentId: string,
    dto: UpdateStudentParentDto,
  ): Promise<StudentParentResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      await this.requireStudentAndParent(
        manager,
        tenantId,
        studentId,
        parentId,
      );
      const relation = await manager.findOne(StudentParentEntity, {
        where: { tenantId, studentId, parentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!relation) {
        throw new NotFoundException('Student-parent relation not found');
      }

      if (dto.isPrimary) {
        await this.clearPrimary(manager, tenantId, studentId);
      }
      if (dto.relationship !== undefined) {
        relation.relationship = dto.relationship;
      }
      if (dto.isPrimary !== undefined) relation.isPrimary = dto.isPrimary;
      if (dto.accessStatus !== undefined) {
        relation.accessStatus = dto.accessStatus;
      }
      await manager.save(relation);
      return this.loadRelation(manager, tenantId, studentId, parentId);
    });
  }

  async removeParent(
    tenantId: string,
    studentId: string,
    parentId: string,
  ): Promise<void> {
    const result = await this.dataSource
      .getRepository(StudentParentEntity)
      .delete({
        tenantId,
        studentId,
        parentId,
      });
    if (result.affected === 0) {
      throw new NotFoundException('Student-parent relation not found');
    }
  }

  private async findEntity(
    tenantId: string,
    id: string,
  ): Promise<StudentEntity> {
    const student = await this.studentsRepository.findById(id, tenantId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  private async requireStudentAndParent(
    manager: EntityManager,
    tenantId: string,
    studentId: string,
    parentId: string,
  ): Promise<void> {
    const student = await manager.findOne(StudentEntity, {
      where: { id: studentId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!student) throw new NotFoundException('Student not found');

    const parent = await manager.findOne(ParentEntity, {
      where: { id: parentId, tenantId },
    });
    if (!parent) throw new NotFoundException('Parent not found');
  }

  private async clearPrimary(
    manager: EntityManager,
    tenantId: string,
    studentId: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(StudentParentEntity)
      .set({ isPrimary: false })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('student_id = :studentId', { studentId })
      .andWhere('is_primary = true')
      .execute();
  }

  private async loadRelation(
    manager: EntityManager,
    tenantId: string,
    studentId: string,
    parentId: string,
  ): Promise<StudentParentResponseDto> {
    const relation = await manager.findOne(StudentParentEntity, {
      where: { tenantId, studentId, parentId },
      relations: { parent: true },
    });
    if (!relation) {
      throw new NotFoundException('Student-parent relation not found');
    }
    return StudentParentResponseDto.fromEntity(relation);
  }
}
