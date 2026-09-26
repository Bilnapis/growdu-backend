import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { ParentRelationship } from '../entities/student-parent.entity.js';

export class AddStudentParentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  parentId: string;

  @ApiProperty({ enum: ParentRelationship })
  @IsEnum(ParentRelationship)
  relationship: ParentRelationship;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ enum: EntityStatus, default: EntityStatus.Active })
  @IsOptional()
  @IsEnum(EntityStatus)
  accessStatus?: EntityStatus;
}

export class UpdateStudentParentDto {
  @ApiPropertyOptional({ enum: ParentRelationship })
  @IsOptional()
  @IsEnum(ParentRelationship)
  relationship?: ParentRelationship;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  accessStatus?: EntityStatus;
}
