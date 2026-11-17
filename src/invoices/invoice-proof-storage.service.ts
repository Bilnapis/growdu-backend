import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import appConfig from '../config/app.config.js';
import { PaymentProofStorage } from '../common/storage/payment-proof-storage.js';
export {
  proofMime,
  MAX_PAYMENT_PROOF_BYTES as MAX_INVOICE_PROOF_BYTES,
  type PaymentProofUpload as InvoiceProofUpload,
} from '../common/storage/payment-proof-storage.js';

@Injectable()
export class InvoiceProofStorage extends PaymentProofStorage {
  constructor(@Inject(appConfig.KEY) config: ConfigType<typeof appConfig>) {
    super(config.invoiceProofStoragePath);
  }
}
