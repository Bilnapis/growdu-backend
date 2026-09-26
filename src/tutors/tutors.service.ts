import { Injectable, NotFoundException } from '@nestjs/common';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { UsersService } from '../users/users.service.js';
import {
  CreateTutorDto,
  TutorsQueryDto,
  UpdateTutorDto,
} from './dto/tutor-input.dto.js';
import { TutorResponseDto } from './dto/tutor-response.dto.js';
import { TutorEntity } from './entities/tutor.entity.js';
import { TutorsRepository } from './repositories/tutors.repository.js';

@Injectable()
export class TutorsService {
  constructor(
    private readonly tutorsRepository: TutorsRepository,
    private readonly usersService: UsersService,
  ) {}

  async findAll(
    tenantId: string,
    query: TutorsQueryDto,
  ): Promise<PaginatedResponse<TutorResponseDto>> {
    const [tutors, total] = await this.tutorsRepository.findPage(
      tenantId,
      query,
    );
    return {
      data: tutors.map(TutorResponseDto.fromEntity),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(tenantId: string, id: string): Promise<TutorResponseDto> {
    return TutorResponseDto.fromEntity(await this.findEntity(tenantId, id));
  }

  async findMe(tenantId: string, userId: string): Promise<TutorResponseDto> {
    const tutor = await this.tutorsRepository.findByUserId(userId, tenantId);
    if (!tutor) {
      throw new NotFoundException('Tutor profile not found');
    }
    return TutorResponseDto.fromEntity(tutor);
  }

  async create(
    tenantId: string,
    dto: CreateTutorDto,
  ): Promise<TutorResponseDto> {
    const tutor = this.tutorsRepository.create({
      tenantId,
      userId: null,
      name: dto.name,
      phoneNumber: dto.phoneNumber,
      sessionRate: this.normalizeRate(dto.sessionRate),
      status: dto.status ?? EntityStatus.Active,
    });
    return TutorResponseDto.fromEntity(await this.tutorsRepository.save(tutor));
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTutorDto,
  ): Promise<TutorResponseDto> {
    const tutor = await this.findEntity(tenantId, id);
    if (dto.name !== undefined) tutor.name = dto.name;
    if (dto.phoneNumber !== undefined) tutor.phoneNumber = dto.phoneNumber;
    if (dto.sessionRate !== undefined) {
      tutor.sessionRate = this.normalizeRate(dto.sessionRate);
    }
    if (dto.status !== undefined) tutor.status = dto.status;

    const saved = await this.tutorsRepository.save(tutor);
    if (dto.status === EntityStatus.Inactive && saved.userId) {
      await this.usersService.revokeAllSessions(saved.userId);
    }
    return TutorResponseDto.fromEntity(saved);
  }

  private async findEntity(tenantId: string, id: string): Promise<TutorEntity> {
    const tutor = await this.tutorsRepository.findById(id, tenantId);
    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }
    return tutor;
  }

  private normalizeRate(value: string): string {
    const [integer, fraction = ''] = value.split('.');
    return `${integer}.${fraction.padEnd(2, '0')}`;
  }
}
