import { ApiProperty } from '@nestjs/swagger';
import type { PayrollItemKind, PayrollStatus } from '../payroll-rules.js';

export class PayrollPeriodResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({
    format: 'date',
    description:
      'First day of the session month, preceding the scheduled payment month. Historical payrolls retain their original range.',
  })
  startDate: string;
  @ApiProperty({
    format: 'date',
    description: 'Last day of the session month, inclusive.',
  })
  endDate: string;
  @ApiProperty({ format: 'date' }) payDate: string;
  @ApiProperty({ type: Date, nullable: true }) generatedAt: Date | null;
}
export class PayrollSettingsResponseDto {
  @ApiProperty() payday: number;
  @ApiProperty() enabled: boolean;
  @ApiProperty() configured: boolean;
  @ApiProperty({ type: PayrollPeriodResponseDto, nullable: true })
  nextPeriod: PayrollPeriodResponseDto | null;
}
export class PayrollListResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tutorId: string;
  @ApiProperty() periodId: string;
  @ApiProperty() number: string;
  @ApiProperty() tutorName: string;
  @ApiProperty({ format: 'date' }) startDate: string;
  @ApiProperty({ format: 'date' }) endDate: string;
  @ApiProperty({ format: 'date' }) payDate: string;
  @ApiProperty({ format: 'date' }) issuedDate: string;
  @ApiProperty({ example: '1200000.00' }) total: string;
  @ApiProperty() totalSessions: number;
  @ApiProperty({ type: String, nullable: true }) baseRate: string | null;
  @ApiProperty({ enum: ['paid', 'unpaid', 'overdue'] }) status: PayrollStatus;
  @ApiProperty() version: number;
}
export class PayrollIdentityResponseDto {
  @ApiProperty() tenantName: string;
  @ApiProperty({ type: String, nullable: true }) tenantAddress: string | null;
  @ApiProperty() tutorName: string;
  @ApiProperty() tutorPhone: string;
  @ApiProperty({ type: String, nullable: true }) tutorEmail: string | null;
  @ApiProperty({ type: String, nullable: true }) subject: string | null;
  @ApiProperty({ type: String, nullable: true }) bankName: string | null;
  @ApiProperty({ type: String, nullable: true }) accountName: string | null;
  @ApiProperty({ type: String, nullable: true }) accountNumber: string | null;
}
export class PayrollItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: String, nullable: true }) studyGroupId: string | null;
  @ApiProperty({ enum: ['teaching', 'addition', 'deduction'] })
  kind: PayrollItemKind;
  @ApiProperty() description: string;
  @ApiProperty() sourceCount: number;
  @ApiProperty() sessionAdjustment: number;
  @ApiProperty() quantity: number;
  @ApiProperty({ type: String, nullable: true }) correctionReason:
    string | null;
  @ApiProperty() rate: string;
  @ApiProperty() subtotal: string;
}
export class PayrollPaymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() amount: string;
  @ApiProperty() paidAt: Date;
  @ApiProperty({ enum: ['cash', 'bank_transfer'] }) method:
    'cash' | 'bank_transfer';
  @ApiProperty({ type: String, nullable: true }) reference: string | null;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty() recordedByName: string;
  @ApiProperty({ type: String, nullable: true }) proofName: string | null;
  @ApiProperty({ type: Date, nullable: true }) reversedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) reversalReason: string | null;
}
export class PayrollEventResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() type: string;
  @ApiProperty({ type: String, nullable: true }) actorId: string | null;
  @ApiProperty({ type: Object }) details: Record<string, unknown>;
  @ApiProperty() createdAt: Date;
}
export class PayrollSourceResponseDto {
  @ApiProperty() sessionId: string;
  @ApiProperty({ format: 'date' }) sessionDate: string;
  @ApiProperty() studyGroupId: string;
  @ApiProperty() studyGroupName: string;
  @ApiProperty() version: number;
}
export class PayrollDetailResponseDto extends PayrollListResponseDto {
  @ApiProperty({ type: [PayrollSourceResponseDto] })
  sources: PayrollSourceResponseDto[];
  @ApiProperty({ type: PayrollIdentityResponseDto })
  snapshot: PayrollIdentityResponseDto;
  @ApiProperty() defaultRate: string;
  @ApiProperty() sourceChanged: boolean;
  @ApiProperty({ type: [PayrollItemResponseDto] })
  items: PayrollItemResponseDto[];
  @ApiProperty({ type: [PayrollPaymentResponseDto] })
  payments: PayrollPaymentResponseDto[];
  @ApiProperty({ type: [PayrollEventResponseDto] })
  events: PayrollEventResponseDto[];
}
export class PayrollSummaryResponseDto {
  @ApiProperty() total: number;
  @ApiProperty() totalAmount: string;
  @ApiProperty() paid: number;
  @ApiProperty() unpaid: number;
  @ApiProperty() overdue: number;
  @ApiProperty({
    description:
      'Active payments in the requested calendar month, based on WIB payment dates.',
  })
  paidAmount: string;
}
export class PayrollGenerationResponseDto {
  @ApiProperty() periodId: string;
  @ApiProperty() created: number;
  @ApiProperty() skippedExisting: number;
  @ApiProperty() skippedMissingRate: number;
  @ApiProperty() skippedNoSessions: number;
}
export class PayrollTutorOptionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() sessionRate: string;
  @ApiProperty({ enum: ['active', 'inactive'] }) status: string;
}
