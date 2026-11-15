import { BadRequestException } from '@nestjs/common';
import type {
  InvoiceEntity,
  InvoiceItemKind,
  InvoiceStatus,
} from './entities/invoice.entity.js';
import { jakartaDate } from '../common/jakarta-date.js';

export function invoiceStatus(
  invoice: Pick<InvoiceEntity, 'paidAt' | 'dueDate'>,
  today = jakartaDate(),
): InvoiceStatus {
  return invoice.paidAt
    ? 'paid'
    : invoice.dueDate < today
      ? 'overdue'
      : 'unpaid';
}

export function invoiceTotal(
  items: readonly {
    kind: InvoiceItemKind;
    quantity: number;
    unitAmount: number;
  }[],
): number {
  if (items.filter((item) => item.kind === 'tuition').length !== 1) {
    throw new BadRequestException(
      'Invoice harus memiliki tepat satu item SPP.',
    );
  }
  const total = items.reduce(
    (sum, item) =>
      sum +
      (item.kind === 'discount' ? -1 : 1) * item.quantity * item.unitAmount,
    0,
  );
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    total > 99_999_999_999_999
  ) {
    throw new BadRequestException(
      'Total invoice harus positif dan dalam batas nominal yang didukung.',
    );
  }
  return total;
}
