import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type { PayrollStatus } from '../payroll-rules.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class PayrollQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '2026-11',
    description: 'Month of the scheduled payment date.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  periodId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tutorId?: string;
  @ApiPropertyOptional({ enum: ['paid', 'unpaid', 'overdue'] })
  @IsOptional()
  @IsIn(['paid', 'unpaid', 'overdue'])
  status?: PayrollStatus;
}
export class UpdatePayrollSettingsDto {
  @ApiProperty({
    minimum: 1,
    maximum: 31,
    description:
      'Monthly generation and due date for the previous calendar month. Changes preserve the open period payment month, even when the new date has passed.',
  })
  @IsInt()
  @Min(1)
  @Max(31)
  payday: number;
  @ApiProperty() @IsBoolean() enabled: boolean;
}
export class GeneratePayrollDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() periodId: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tutorId?: string;
}
export class GeneratePayrollMonthDto {
  @ApiProperty({
    example: '2026-10',
    description:
      'Completed session month, independent of whether its payroll period already exists.',
  })
  @Matches(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
  sessionMonth: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tutorId?: string;
}
export class PayrollVersionDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version: number;
}
export class TeachingItemInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ minimum: 0, maximum: 100000 })
  @IsInt()
  @Min(0)
  @Max(100_000)
  quantity: number;
  @ApiProperty({ example: '150000.00' })
  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  rate: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  correctionReason?: string;
}
export class PayrollAdjustmentInputDto {
  @ApiProperty({ enum: ['addition', 'deduction'] })
  @IsIn(['addition', 'deduction'])
  kind: 'addition' | 'deduction';
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description: string;
  @ApiProperty({ example: '25000.00' })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  amount: string;
}
export class UpdatePayrollItemsDto extends PayrollVersionDto {
  @ApiProperty({ type: [TeachingItemInputDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => TeachingItemInputDto)
  teaching: TeachingItemInputDto[];
  @ApiProperty({ type: [PayrollAdjustmentInputDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PayrollAdjustmentInputDto)
  adjustments: PayrollAdjustmentInputDto[];
}
export class RecordPayrollPaymentDto extends PayrollVersionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') requestId: string;
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  paidAt: string;
  @ApiProperty({ enum: ['cash', 'bank_transfer'] })
  @IsIn(['cash', 'bank_transfer'])
  method: 'cash' | 'bank_transfer';
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  reference?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
}
export class ReversePayrollPaymentDto extends PayrollVersionDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}
