import { ApiProperty } from '@nestjs/swagger';
import { AnnouncementEntity } from '../entities/announcement.entity.js';
import {
  AnnouncementStatus,
  AnnouncementTargetRole,
  announcementStatus,
} from '../announcement.types.js';

export class AnnouncementResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  tenantId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: AnnouncementTargetRole })
  targetRole: AnnouncementTargetRole;

  @ApiProperty({ enum: AnnouncementStatus })
  status: AnnouncementStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startsAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endsAt: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  static fromEntity(
    entity: AnnouncementEntity,
    now = new Date(),
  ): AnnouncementResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      title: entity.title,
      content: entity.content,
      targetRole: entity.targetRole,
      startsAt: entity.startsAt,
      endsAt: entity.endsAt,
      status: announcementStatus(
        entity.startsAt ? new Date(entity.startsAt) : null,
        entity.endsAt ? new Date(entity.endsAt) : null,
        now,
      ),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
