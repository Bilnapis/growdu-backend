import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { InvoicePaymentEntity } from './entities/invoice.entity.js';
import type {
  RecordInvoicePaymentDto,
  ReverseInvoicePaymentDto,
} from './dto/invoice-input.dto.js';
import { InvoiceStore } from './invoice-store.service.js';
import {
  InvoiceProofStorage,
  type InvoiceProofUpload,
} from './invoice-proof-storage.service.js';
import { OwnerEntity } from '../owners/entities/owner.entity.js';
import { OperatorEntity } from '../operators/entities/operator.entity.js';
import { UserRole } from '../users/entities/user.entity.js';
import { jakartaDate } from '../common/jakarta-date.js';
import { isDuplicateEntryError } from '../common/database/database-error.util.js';

@Injectable()
export class InvoicePaymentsService {
  constructor(
    private readonly store: InvoiceStore,
    private readonly proofs: InvoiceProofStorage,
  ) {}

  async record(
    user: AuthenticatedUser,
    id: string,
    dto: RecordInvoicePaymentDto,
    file?: InvoiceProofUpload,
  ) {
    const paidAt = new Date(dto.paidAt);
    if (!Number.isFinite(paidAt.getTime()) || paidAt.getTime() > Date.now())
      throw new BadRequestException(
        'Tanggal pembayaran tidak boleh di masa depan.',
      );
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          id,
          paidAt: dto.paidAt,
          method: dto.method,
          reference: dto.reference ?? '',
          note: dto.note ?? '',
          proof: file
            ? createHash('sha256').update(file.buffer).digest('hex')
            : null,
        }),
      )
      .digest('hex');
    let stored: Awaited<ReturnType<InvoiceProofStorage['store']>> | undefined;
    try {
      await this.store.db.transaction(async (m) => {
        const { student, invoice } = await this.store.lockInvoice(
          m,
          user.tenantId,
          id,
        );
        const duplicate = await m.findOneBy(InvoicePaymentEntity, {
          tenantId: user.tenantId,
          requestId: dto.requestId,
        });
        if (duplicate) {
          if (
            duplicate.invoiceId !== id ||
            duplicate.requestHash !== requestHash
          )
            throw new ConflictException(
              'Kunci pembayaran telah digunakan untuk transaksi lain.',
            );
          return;
        }
        if (invoice.paidAt) throw new ConflictException('Invoice sudah lunas.');
        if (invoice.version !== dto.version)
          throw new ConflictException(
            'Invoice berubah. Muat ulang sebelum membayar.',
          );
        if (dto.method === 'bank_transfer' && !invoice.snapshot.bankAccount)
          throw new BadRequestException(
            'Rekening tujuan invoice belum tersedia. Gunakan pembayaran tunai.',
          );
        if (jakartaDate(paidAt) < invoice.issuedDate)
          throw new BadRequestException(
            'Tanggal pembayaran tidak boleh sebelum tanggal terbit.',
          );
        const recorder =
          user.role === UserRole.Owner
            ? await m.findOneBy(OwnerEntity, { userId: user.id })
            : await m.findOneBy(OperatorEntity, {
                userId: user.id,
                tenantId: user.tenantId,
              });
        if (file) stored = await this.proofs.store(file);
        await m.save(
          InvoicePaymentEntity,
          m.create(InvoicePaymentEntity, {
            tenantId: user.tenantId,
            invoiceId: id,
            requestId: dto.requestId,
            requestHash,
            amount: invoice.total,
            paidAt,
            method: dto.method,
            reference: dto.reference || null,
            note: dto.note || null,
            recordedBy: user.id,
            recordedByName: recorder?.name || user.email,
            proofKey: stored?.key ?? null,
            proofName: stored?.name ?? null,
            proofMime: stored?.mime ?? null,
            reversedAt: null,
            reversalReason: null,
          }),
        );
        invoice.paidAt = paidAt;
        invoice.version += 1;
        await m.save(invoice);
        await this.store.event(m, invoice, 'payment_recorded', user.id, {
          amount: invoice.total,
          method: dto.method,
          paidAt: dto.paidAt,
        });
        await this.store.syncStudent(m, student, new Date(), user.id, invoice);
      });
    } catch (error: unknown) {
      if (stored) await this.proofs.remove(stored.key);
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          'Kunci pembayaran telah digunakan untuk transaksi lain.',
        );
      }
      throw error;
    }
    return this.store.detail(user.tenantId, id);
  }

  async reverse(
    user: AuthenticatedUser,
    id: string,
    paymentId: string,
    dto: ReverseInvoicePaymentDto,
  ) {
    await this.store.db.transaction(async (m) => {
      const { student, invoice } = await this.store.lockInvoice(
        m,
        user.tenantId,
        id,
      );
      const payment = await m.findOneBy(InvoicePaymentEntity, {
        id: paymentId,
        tenantId: user.tenantId,
        invoiceId: id,
      });
      if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan.');
      if (payment.reversedAt)
        throw new ConflictException('Pencatatan pembayaran sudah dibatalkan.');
      if (invoice.version !== dto.version)
        throw new ConflictException(
          'Invoice berubah. Muat ulang sebelum membatalkan.',
        );
      payment.reversedAt = new Date();
      payment.reversalReason = dto.reason;
      await m.save(payment);
      invoice.paidAt = null;
      invoice.version += 1;
      await m.save(invoice);
      await this.store.event(m, invoice, 'payment_reversed', user.id, {
        paymentId,
        reason: dto.reason,
      });
      await this.store.syncStudent(m, student, new Date(), user.id, invoice);
    });
    return this.store.detail(user.tenantId, id);
  }

  async proof(tenantId: string, id: string, paymentId: string) {
    const p = await this.store.db
      .getRepository(InvoicePaymentEntity)
      .createQueryBuilder('p')
      .addSelect('p.proofKey')
      .where('p.tenant_id=:tenantId AND p.invoice_id=:id AND p.id=:paymentId', {
        tenantId,
        id,
        paymentId,
      })
      .getOne();
    if (!p?.proofKey)
      throw new NotFoundException('Bukti pembayaran tidak ditemukan.');
    return {
      buffer: await this.proofs.read(p.proofKey),
      mime: p.proofMime ?? 'application/octet-stream',
    };
  }
}
