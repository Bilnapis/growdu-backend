import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsDefined,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { ParentRelationship } from '../entities/student-parent.entity.js';
import { StudentGender } from '../entities/student.entity.js';
import { UpdateStudentDto } from './student-input.dto.js';

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
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional active study group for initial enrollment.',
  })
  @IsOptional()
  @IsUUID('4')
  studyGroupId?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 1_000_000_000,
    description:
      'Monthly SPP fee in whole rupiah; null or omitted leaves billing unconfigured.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  monthlyFee?: number | null;

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

export class UpdateRegisteredParentDto {
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
}

export class UpdateStudentRegistrationDto extends UpdateStudentDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 1_000_000_000,
    description:
      'Monthly SPP fee. Omit to preserve the current fee; null stops new invoices without clearing existing debts.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  monthlyFee?: number | null;

  @ApiProperty({ type: UpdateRegisteredParentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateRegisteredParentDto)
  parent: UpdateRegisteredParentDto;
}
