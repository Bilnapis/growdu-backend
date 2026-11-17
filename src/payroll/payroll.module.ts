import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PayrollEntity,
  PayrollEventEntity,
  PayrollItemEntity,
  PayrollPaymentEntity,
  PayrollPeriodEntity,
  PayrollSequenceEntity,
  PayrollSettingsEntity,
  PayrollSourceEntity,
} from './entities/payroll.entity.js';
import {
  PayrollController,
  TutorPayrollController,
} from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';
import { PayrollStore } from './payroll-store.service.js';
import { PayrollPeriodsService } from './payroll-periods.service.js';
import { PayrollGenerationService } from './payroll-generation.service.js';
import {
  PayrollPaymentsService,
  PayrollProofStorage,
} from './payroll-payments.service.js';
import { PayrollPdfService } from './payroll-pdf.service.js';
import { PayrollAutomationService } from './payroll-automation.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayrollEntity,
      PayrollItemEntity,
      PayrollPeriodEntity,
      PayrollPaymentEntity,
      PayrollSettingsEntity,
      PayrollSourceEntity,
      PayrollEventEntity,
      PayrollSequenceEntity,
    ]),
  ],
  controllers: [PayrollController, TutorPayrollController],
  providers: [
    PayrollService,
    PayrollStore,
    PayrollPeriodsService,
    PayrollGenerationService,
    PayrollPaymentsService,
    PayrollProofStorage,
    PayrollPdfService,
    PayrollAutomationService,
  ],
})
export class PayrollModule {}
