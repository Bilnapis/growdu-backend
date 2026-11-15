import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  InvoiceEntity,
  InvoiceEventEntity,
  InvoiceItemEntity,
  InvoicePaymentEntity,
  InvoiceSequenceEntity,
  InvoiceSettingsEntity,
} from './entities/invoice.entity.js';
import {
  InvoiceBankController,
  InvoicesController,
} from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { InvoiceStore } from './invoice-store.service.js';
import { InvoiceGenerationService } from './invoice-generation.service.js';
import { InvoicePaymentsService } from './invoice-payments.service.js';
import { InvoiceProofStorage } from './invoice-proof-storage.service.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { InvoiceAutomationService } from './invoice-automation.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InvoiceEntity,
      InvoiceItemEntity,
      InvoicePaymentEntity,
      InvoiceEventEntity,
      InvoiceSettingsEntity,
      InvoiceSequenceEntity,
    ]),
  ],
  controllers: [InvoicesController, InvoiceBankController],
  providers: [
    InvoicesService,
    InvoiceStore,
    InvoiceGenerationService,
    InvoicePaymentsService,
    InvoiceProofStorage,
    InvoicePdfService,
    InvoiceAutomationService,
  ],
})
export class InvoicesModule {}
