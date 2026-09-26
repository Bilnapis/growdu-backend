import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import {
  StudentParentEntity,
  ParentRelationship,
} from '../entities/student-parent.entity.js';
import { StudentEntity, StudentGender } from '../entities/student.entity.js';

export class StudentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  tenantId: string;

  @ApiProperty()
  studentCode: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: StudentGender })
  gender: StudentGender;

  @ApiProperty()
  educationLevel: string;

  @ApiProperty()
  school: string;

  @ApiPropertyOptional({ nullable: true })
  phoneNumber: string | null;

  @ApiProperty()
  address: string;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  static fromEntity(entity: StudentEntity): StudentResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      studentCode: entity.studentCode,
      name: entity.name,
      gender: entity.gender,
      educationLevel: entity.educationLevel,
      school: entity.school,
      phoneNumber: entity.phoneNumber,
      address: entity.address,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

export class StudentParentResponseDto {
  @ApiProperty({ format: 'uuid' })
  parentId: string;

  @ApiProperty()
  parentName: string;

  @ApiProperty()
  parentPhoneNumber: string;

  @ApiProperty({ format: 'email' })
  parentContactEmail: string;

  @ApiProperty({ enum: ParentRelationship })
  relationship: ParentRelationship;

  @ApiProperty()
  isPrimary: boolean;

  @ApiProperty({ enum: EntityStatus })
  accessStatus: EntityStatus;

  static fromEntity(entity: StudentParentEntity): StudentParentResponseDto {
    return {
      parentId: entity.parentId,
      parentName: entity.parent.name,
      parentPhoneNumber: entity.parent.phoneNumber,
      parentContactEmail: entity.parent.contactEmail,
      relationship: entity.relationship,
      isPrimary: entity.isPrimary,
      accessStatus: entity.accessStatus,
    };
  }
}
