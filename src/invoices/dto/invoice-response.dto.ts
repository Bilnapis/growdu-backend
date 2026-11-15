import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceBankAccountDto } from './invoice-input.dto.js';
import type {
  InvoiceBankAccount,
  InvoiceItemKind,
  InvoiceSnapshot,
  InvoiceStatus,
  PaymentMethod,
} from '../entities/invoice.entity.js';

export class InvoiceSettingsResponseDto {
  @ApiProperty({ default: 1 }) dueDay: number;
  @ApiProperty({ default: 0 }) graceDays: number;
  @ApiProperty({ type: InvoiceBankAccountDto, nullable: true })
  bankAccount: InvoiceBankAccount | null;
}
export class BillingProfileResponseDto {
  @ApiProperty() studentId: string;
  @ApiProperty({ type: Number, nullable: true }) monthlyFee: number | null;
  @ApiProperty({ type: String, nullable: true }) nextInvoicePeriod:
    string | null;
}
export class InvoiceStudentOptionResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() studentCode: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: Number, nullable: true }) monthlyFee: number | null;
}
export class InvoiceGroupResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}
export class InvoiceSnapshotResponseDto {
  @ApiProperty() tenantName: string;
  @ApiProperty({ type: String, nullable: true }) tenantAddress: string | null;
  @ApiProperty() studentCode: string;
  @ApiProperty() studentName: string;
  @ApiProperty() educationLevel: string;
  @ApiProperty() school: string;
  @ApiProperty() address: string;
  @ApiProperty({ type: String, nullable: true }) parentName: string | null;
  @ApiProperty({ type: String, nullable: true }) parentPhone: string | null;
  @ApiProperty({ type: String, nullable: true }) parentEmail: string | null;
  @ApiProperty({ type: [InvoiceGroupResponseDto] })
  groups: InvoiceGroupResponseDto[];
  @ApiProperty({ type: InvoiceBankAccountDto, nullable: true })
  bankAccount: InvoiceBankAccount | null;
}
export class InvoiceListResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() studentId: string;
  @ApiProperty() number: string;
  @ApiProperty({ example: '2026-11' }) period: string;
  @ApiProperty() studentName: string;
  @ApiProperty({ type: [InvoiceGroupResponseDto] }) groups: {
    id: string;
    name: string;
  }[];
  @ApiProperty({ format: 'date' }) issuedDate: string;
  @ApiProperty({ format: 'date' }) dueDate: string;
  @ApiProperty({ format: 'date' }) suspensionDate: string;
  @ApiProperty() total: number;
  @ApiProperty({ enum: ['paid', 'unpaid', 'overdue'] }) status: InvoiceStatus;
  @ApiProperty() version: number;
  @ApiProperty() updatedAt: Date;
}
export class InvoiceItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['tuition', 'charge', 'discount'] })
  kind: InvoiceItemKind;
  @ApiProperty() description: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unitAmount: number;
  @ApiProperty() subtotal: number;
}
export class InvoicePaymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() amount: number;
  @ApiProperty({ format: 'date-time' }) paidAt: Date;
  @ApiProperty({ enum: ['cash', 'bank_transfer'] }) method: PaymentMethod;
  @ApiProperty({ type: String, nullable: true }) reference: string | null;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty() recordedByName: string;
  @ApiProperty({ type: String, nullable: true }) proofName: string | null;
  @ApiProperty({ type: String, nullable: true }) reversedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) reversalReason: string | null;
}
export class InvoiceEventResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() type: string;
  @ApiProperty({ type: String, nullable: true }) actorId: string | null;
  @ApiProperty({ type: Object }) details: Record<string, unknown>;
  @ApiProperty() createdAt: Date;
}
export class InvoiceDetailResponseDto extends InvoiceListResponseDto {
  @ApiProperty({ type: InvoiceSnapshotResponseDto }) snapshot: InvoiceSnapshot;
  @ApiProperty({ type: [InvoiceItemResponseDto] })
  items: InvoiceItemResponseDto[];
  @ApiProperty({ type: [InvoicePaymentResponseDto] })
  payments: InvoicePaymentResponseDto[];
  @ApiProperty({ type: [InvoiceEventResponseDto] })
  events: InvoiceEventResponseDto[];
  @ApiProperty() billingBlocked: boolean;
  @ApiProperty({ enum: ['active', 'inactive'] }) studentStatus: string;
}
export class InvoiceSummaryResponseDto {
  @ApiProperty() totalAmount: number;
  @ApiProperty() total: number;
  @ApiProperty() paid: number;
  @ApiProperty() unpaid: number;
  @ApiProperty() overdue: number;
  @ApiProperty() pending: number;
}
export class InvoiceGenerationResponseDto {
  @ApiProperty() created: number;
  @ApiProperty() skippedExisting: number;
  @ApiProperty() skippedMissingFee: number;
  @ApiPropertyOptional() period: string;
}
export class InvoiceOptionsResponseDto {
  @ApiProperty({ type: [InvoiceGroupResponseDto] }) groups: {
    id: string;
    name: string;
  }[];
}
