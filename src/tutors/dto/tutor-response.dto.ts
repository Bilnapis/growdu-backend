import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { TutorEntity } from '../entities/tutor.entity.js';

export class TutorsSummaryResponseDto {
  @ApiProperty() active: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Active tutors at the end of the previous month in Asia/Jakarta, or null when history is unavailable.',
  })
  previousMonthActive: number | null;
}

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

  @ApiPropertyOptional({ nullable: true })
  email: string | null;

  @ApiPropertyOptional({ nullable: true })
  address: string | null;

  @ApiPropertyOptional({ nullable: true })
  expertise: string | null;

  @ApiPropertyOptional({ nullable: true })
  education: string | null;

  @ApiPropertyOptional({ nullable: true })
  bankName: string | null;

  @ApiPropertyOptional({ nullable: true })
  accountName: string | null;

  @ApiPropertyOptional({ nullable: true })
  accountNumber: string | null;

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
      email: entity.email,
      address: entity.address,
      expertise: entity.expertise,
      education: entity.education,
      bankName: entity.bankName,
      accountName: entity.accountName,
      accountNumber: entity.accountNumber,
      sessionRate: entity.sessionRate,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
