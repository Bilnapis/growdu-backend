import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsDefined,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { ParentRelationship } from '../entities/student-parent.entity.js';
import { StudentGender } from '../entities/student.entity.js';

export enum StudentParentSource {
  New = 'new',
  Existing = 'existing',
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class NewStudentParentDto {
  @ApiProperty({ minLength: 2, maxLength: 150 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiProperty({ minLength: 6, maxLength: 20 })
  @Transform(trim)
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phoneNumber: string;

  @ApiProperty({ format: 'email', maxLength: 150 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(150)
  email: string;

  @ApiProperty({ minLength: 5, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(5)
  @MaxLength(128)
  password: string;
}

export class CreateStudentRegistrationDto {
  @ApiProperty({ minLength: 2, maxLength: 150 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiProperty({ enum: StudentGender })
  @IsEnum(StudentGender)
  gender: StudentGender;

  @ApiProperty({ maxLength: 50 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  educationLevel: string;

  @ApiProperty({ maxLength: 150 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  school: string;

  @ApiPropertyOptional({ nullable: true, minLength: 6, maxLength: 20 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phoneNumber?: string | null;

  @ApiProperty({ maxLength: 5_000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5_000)
  address: string;

  @ApiPropertyOptional({ enum: EntityStatus, default: EntityStatus.Active })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @ApiProperty({ enum: StudentParentSource })
  @IsEnum(StudentParentSource)
  parentSource: StudentParentSource;

  @ApiPropertyOptional({ type: NewStudentParentDto })
  @ValidateIf(
    (dto: CreateStudentRegistrationDto) =>
      dto.parentSource === StudentParentSource.New,
  )
  @IsDefined()
  @ValidateNested()
  @Type(() => NewStudentParentDto)
  newParent?: NewStudentParentDto;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(
    (dto: CreateStudentRegistrationDto) =>
      dto.parentSource === StudentParentSource.Existing,
  )
  @IsDefined()
  @IsUUID('4')
  parentId?: string;

  @ApiPropertyOptional({
    enum: ParentRelationship,
    default: ParentRelationship.Guardian,
  })
  @IsOptional()
  @IsEnum(ParentRelationship)
  relationship?: ParentRelationship;
}
