import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type {
  InvoiceItemKind,
  InvoiceStatus,
  PaymentMethod,
} from '../entities/invoice.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class InvoiceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-11' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;
  @ApiPropertyOptional({ enum: ['paid', 'unpaid', 'overdue'] })
  @IsOptional()
  @IsIn(['paid', 'unpaid', 'overdue'])
  status?: InvoiceStatus;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  studentId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class UpdateInvoiceSettingsDto {
  @ApiProperty({ minimum: 1, maximum: 31, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay: number;
  @ApiProperty({ minimum: 0, maximum: 90, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  graceDays: number;
}

export class InvoiceBankAccountDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  bankName: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(100) branch: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Matches(/^[0-9 -]{5,40}$/)
  accountNumber: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  accountHolder: string;
}

export class UpdateInvoiceBankAccountDto {
  @ApiProperty({ type: InvoiceBankAccountDto, nullable: true })
  @ValidateIf((v: UpdateInvoiceBankAccountDto) => v.bankAccount !== null)
  @ValidateNested()
  @Type(() => InvoiceBankAccountDto)
  bankAccount: InvoiceBankAccountDto | null;
}

export class UpdateBillingProfileDto {
  @ApiProperty({ minimum: 1, maximum: 1_000_000_000, nullable: true })
  @ValidateIf((v: UpdateBillingProfileDto) => v.monthlyFee !== null)
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  monthlyFee: number | null;
}

export class GenerateInvoicesDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Generate only for this student. Omit to generate for all eligible active students.',
  })
  @ValidateIf(
    (_dto: GenerateInvoicesDto, value: unknown) => value !== undefined,
  )
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    format: 'date',
    description:
      'Manual generation only; defaults to max(today, configured due date).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;
}

export class InvoiceItemInputDto {
  @ApiProperty({ enum: ['tuition', 'charge', 'discount'] })
  @IsIn(['tuition', 'charge', 'discount'])
  kind: InvoiceItemKind;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description: string;
  @ApiProperty({ minimum: 1, maximum: 120 })
  @IsInt()
  @Min(1)
  @Max(120)
  quantity: number;
  @ApiProperty({ minimum: 1, maximum: 1_000_000_000 })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  unitAmount: number;
}

export class UpdateInvoiceItemsDto {
  @ApiProperty() @IsInt() @Min(1) version: number;
  @ApiProperty({ type: [InvoiceItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemInputDto)
  items: InvoiceItemInputDto[];
}

export class RecordInvoicePaymentDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') requestId: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version: number;
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  paidAt: string;
  @ApiProperty({ enum: ['cash', 'bank_transfer'] })
  @IsIn(['cash', 'bank_transfer'])
  method: PaymentMethod;
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

export class ReverseInvoicePaymentDto {
  @ApiProperty() @IsInt() @Min(1) version: number;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}
