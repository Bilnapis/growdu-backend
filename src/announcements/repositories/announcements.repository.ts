import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { AnnouncementTargetRole } from '../announcement.types.js';
import { AnnouncementsQueryDto } from '../dto/announcement-input.dto.js';
import { AnnouncementEntity } from '../entities/announcement.entity.js';

@Injectable()
export class AnnouncementsRepository {
  constructor(
    @InjectRepository(AnnouncementEntity)
    private readonly repository: Repository<AnnouncementEntity>,
  ) {}

  findPage(
    tenantId: string,
    query: AnnouncementsQueryDto,
  ): Promise<[AnnouncementEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('announcement')
      .where('announcement.tenant_id = :tenantId', { tenantId });
    if (query.search)
      builder.andWhere("announcement.title LIKE :search ESCAPE '!'", {
        search: `%${query.search.replace(/[!%_]/g, '!$&')}%`,
      });
    if (query.targetRole)
      builder.andWhere('announcement.target_role = :targetRole', {
        targetRole: query.targetRole,
      });
    return builder
      .orderBy('announcement.createdAt', 'DESC')
      .addOrderBy('announcement.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  findActivePage(
    tenantId: string,
    targetRole: AnnouncementTargetRole,
    query: PaginationQueryDto,
    now: Date,
  ): Promise<[AnnouncementEntity[], number]> {
    return this.repository
      .createQueryBuilder('announcement')
      .where('announcement.tenant_id = :tenantId', { tenantId })
      .andWhere('announcement.target_role IN (:...targets)', {
        targets: [AnnouncementTargetRole.All, targetRole],
      })
      .andWhere('announcement.starts_at <= :now', { now: now.toISOString() })
      .andWhere('(announcement.ends_at IS NULL OR announcement.ends_at > :now)')
      .orderBy('announcement.startsAt', 'DESC')
      .addOrderBy('announcement.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  findById(tenantId: string, id: string): Promise<AnnouncementEntity | null> {
    return this.repository.findOne({ where: { tenantId, id } });
  }

  create(input: Partial<AnnouncementEntity>): AnnouncementEntity {
    return this.repository.create(input);
  }
  save(entity: AnnouncementEntity): Promise<AnnouncementEntity> {
    return this.repository.save(entity);
  }
  async remove(entity: AnnouncementEntity): Promise<void> {
    await this.repository.remove(entity);
  }
}
