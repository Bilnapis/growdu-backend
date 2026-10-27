import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createPaginationMeta,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';
import type { UserRole } from '../users/entities/user.entity.js';
import { announcementTargetForRole } from './announcement.types.js';
import {
  AnnouncementsQueryDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcement-input.dto.js';
import { AnnouncementResponseDto } from './dto/announcement-response.dto.js';
import { AnnouncementsRepository } from './repositories/announcements.repository.js';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly repository: AnnouncementsRepository) {}

  async findAll(tenantId: string, query: AnnouncementsQueryDto) {
    const now = new Date();
    const [entities, total] = await this.repository.findPage(tenantId, query);
    return {
      data: entities.map((entity) =>
        AnnouncementResponseDto.fromEntity(entity, now),
      ),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async findActive(
    tenantId: string,
    role: UserRole,
    query: PaginationQueryDto,
  ) {
    const now = new Date();
    const [entities, total] = await this.repository.findActivePage(
      tenantId,
      announcementTargetForRole(role),
      query,
      now,
    );
    return {
      data: entities.map((entity) =>
        AnnouncementResponseDto.fromEntity(entity, now),
      ),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(
    tenantId: string,
    id: string,
  ): Promise<AnnouncementResponseDto> {
    return AnnouncementResponseDto.fromEntity(
      await this.requireAnnouncement(tenantId, id),
    );
  }

  async create(
    tenantId: string,
    dto: CreateAnnouncementDto,
  ): Promise<AnnouncementResponseDto> {
    const startsAt = this.normalizeDate(dto.startsAt ?? null);
    const endsAt = this.normalizeDate(dto.endsAt ?? null);
    this.validateDates(startsAt, endsAt);
    const entity = this.repository.create({
      tenantId,
      title: dto.title,
      content: dto.content,
      targetRole: dto.targetRole,
      startsAt,
      endsAt,
    });
    return AnnouncementResponseDto.fromEntity(
      await this.repository.save(entity),
    );
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateAnnouncementDto,
  ): Promise<AnnouncementResponseDto> {
    const entity = await this.requireAnnouncement(tenantId, id);
    const startsAt =
      dto.startsAt === undefined
        ? entity.startsAt
        : this.normalizeDate(dto.startsAt);
    const endsAt =
      dto.endsAt === undefined ? entity.endsAt : this.normalizeDate(dto.endsAt);
    this.validateDates(startsAt, endsAt);
    if (dto.title !== undefined) entity.title = dto.title;
    if (dto.content !== undefined) entity.content = dto.content;
    if (dto.targetRole !== undefined) entity.targetRole = dto.targetRole;
    entity.startsAt = startsAt;
    entity.endsAt = endsAt;
    return AnnouncementResponseDto.fromEntity(
      await this.repository.save(entity),
    );
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.repository.remove(await this.requireAnnouncement(tenantId, id));
  }

  private async requireAnnouncement(tenantId: string, id: string) {
    const entity = await this.repository.findById(tenantId, id);
    if (!entity) throw new NotFoundException('Pengumuman tidak ditemukan.');
    return entity;
  }

  private normalizeDate(value: string | null): string | null {
    if (value === null) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()))
      throw new BadRequestException('Tanggal pengumuman tidak valid.');
    const normalized = date.toISOString();
    if (normalized.length !== 24)
      throw new BadRequestException('Tanggal pengumuman tidak valid.');
    return normalized;
  }

  private validateDates(startsAt: string | null, endsAt: string | null): void {
    if (endsAt && (!startsAt || endsAt <= startsAt))
      throw new BadRequestException(
        'Tanggal berakhir harus setelah tanggal mulai tampil.',
      );
  }
}
