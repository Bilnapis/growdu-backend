import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { TutorEntity } from '../entities/tutor.entity.js';

export class TutorResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  tenantId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  userId: string | null;

  @ApiProperty()
  name: string;

  @ApiProperty()
  phoneNumber: string;

  @ApiProperty({ example: '150000.00' })
  sessionRate: string;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  static fromEntity(entity: TutorEntity): TutorResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      userId: entity.userId,
      name: entity.name,
      phoneNumber: entity.phoneNumber,
      sessionRate: entity.sessionRate,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
