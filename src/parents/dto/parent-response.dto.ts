import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { StudentResponseDto } from '../../students/dto/student-response.dto.js';
import { ParentRelationship } from '../../students/entities/student-parent.entity.js';
import { ParentEntity } from '../entities/parent.entity.js';

export class ParentResponseDto {
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

  @ApiProperty({ format: 'email' })
  contactEmail: string;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  static fromEntity(entity: ParentEntity): ParentResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      userId: entity.userId,
      name: entity.name,
      phoneNumber: entity.phoneNumber,
      contactEmail: entity.contactEmail,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

export class ParentStudentResponseDto {
  @ApiProperty({ type: StudentResponseDto })
  student: StudentResponseDto;

  @ApiProperty({ enum: ParentRelationship })
  relationship: ParentRelationship;

  @ApiProperty()
  isPrimary: boolean;

  @ApiProperty({ enum: EntityStatus })
  accessStatus: EntityStatus;
}
