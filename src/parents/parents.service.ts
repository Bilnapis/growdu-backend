import { Injectable, NotFoundException } from '@nestjs/common';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { StudentResponseDto } from '../students/dto/student-response.dto.js';
import { UsersService } from '../users/users.service.js';
import {
  CreateParentDto,
  ParentsQueryDto,
  UpdateParentDto,
} from './dto/parent-input.dto.js';
import {
  ParentResponseDto,
  ParentStudentResponseDto,
} from './dto/parent-response.dto.js';
import { ParentEntity } from './entities/parent.entity.js';
import { ParentsRepository } from './repositories/parents.repository.js';

@Injectable()
export class ParentsService {
  constructor(
    private readonly parentsRepository: ParentsRepository,
    private readonly usersService: UsersService,
  ) {}

  async findAll(
    tenantId: string,
    query: ParentsQueryDto,
  ): Promise<PaginatedResponse<ParentResponseDto>> {
    const [parents, total] = await this.parentsRepository.findPage(
      tenantId,
      query,
    );
    return {
      data: parents.map(ParentResponseDto.fromEntity),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(tenantId: string, id: string): Promise<ParentResponseDto> {
    return ParentResponseDto.fromEntity(await this.findEntity(tenantId, id));
  }

  async findMe(tenantId: string, userId: string): Promise<ParentResponseDto> {
    return ParentResponseDto.fromEntity(
      await this.findEntityByUser(tenantId, userId),
    );
  }

  async findMyStudents(
    tenantId: string,
    userId: string,
  ): Promise<ParentStudentResponseDto[]> {
    const parent = await this.findEntityByUser(tenantId, userId);
    const relations = await this.parentsRepository.findAccessibleStudents(
      tenantId,
      parent.id,
    );
    return relations.map((relation) => ({
      student: StudentResponseDto.fromEntity(relation.student),
      relationship: relation.relationship,
      isPrimary: relation.isPrimary,
      accessStatus: relation.accessStatus,
    }));
  }

  async findMyStudent(
    tenantId: string,
    userId: string,
    studentId: string,
  ): Promise<ParentStudentResponseDto> {
    const parent = await this.findEntityByUser(tenantId, userId);
    const relation = await this.parentsRepository.findAccessibleStudent(
      tenantId,
      parent.id,
      studentId,
    );
    if (!relation) {
      throw new NotFoundException('Student not found');
    }
    return {
      student: StudentResponseDto.fromEntity(relation.student),
      relationship: relation.relationship,
      isPrimary: relation.isPrimary,
      accessStatus: relation.accessStatus,
    };
  }

  async create(
    tenantId: string,
    dto: CreateParentDto,
  ): Promise<ParentResponseDto> {
    const parent = this.parentsRepository.create({
      tenantId,
      userId: null,
      name: dto.name,
      phoneNumber: dto.phoneNumber,
      contactEmail: dto.contactEmail,
      status: dto.status ?? EntityStatus.Active,
    });
    return ParentResponseDto.fromEntity(
      await this.parentsRepository.save(parent),
    );
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateParentDto,
  ): Promise<ParentResponseDto> {
    const parent = await this.findEntity(tenantId, id);
    if (dto.name !== undefined) parent.name = dto.name;
    if (dto.phoneNumber !== undefined) parent.phoneNumber = dto.phoneNumber;
    if (dto.contactEmail !== undefined) parent.contactEmail = dto.contactEmail;
    if (dto.status !== undefined) parent.status = dto.status;

    const saved = await this.parentsRepository.save(parent);
    if (dto.status === EntityStatus.Inactive && saved.userId) {
      await this.usersService.revokeAllSessions(saved.userId);
    }
    return ParentResponseDto.fromEntity(saved);
  }

  private async findEntity(
    tenantId: string,
    id: string,
  ): Promise<ParentEntity> {
    const parent = await this.parentsRepository.findById(id, tenantId);
    if (!parent) {
      throw new NotFoundException('Parent not found');
    }
    return parent;
  }

  private async findEntityByUser(
    tenantId: string,
    userId: string,
  ): Promise<ParentEntity> {
    const parent = await this.parentsRepository.findByUserId(userId, tenantId);
    if (!parent) {
      throw new NotFoundException('Parent profile not found');
    }
    return parent;
  }
}
