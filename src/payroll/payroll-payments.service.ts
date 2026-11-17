import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { In } from 'typeorm';
import appConfig from '../config/app.config.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { isDuplicateEntryError } from '../common/database/database-error.util.js';
import { jakartaDate } from '../common/jakarta-date.js';
import {
  PaymentProofStorage,
  type PaymentProofUpload,
} from '../common/storage/payment-proof-storage.js';
import { OwnerEntity } from '../owners/entities/owner.entity.js';
import { OperatorEntity } from '../operators/entities/operator.entity.js';
import { ClassSessionEntity } from '../class-sessions/entities/class-session.entity.js';
import {
  PayrollPaymentEntity,
  PayrollSourceEntity,
} from './entities/payroll.entity.js';
import {
  RecordPayrollPaymentDto,
  ReversePayrollPaymentDto,
} from './dto/payroll-input.dto.js';
import { PayrollStore } from './payroll-store.service.js';

@Injectable()
export class PayrollProofStorage extends PaymentProofStorage {
  constructor(@Inject(appConfig.KEY) config: ConfigType<typeof appConfig>) {
    super(config.payrollProofStoragePath);
  }
}

@Injectable()
export class PayrollPaymentsService {
  constructor(
    private readonly store: PayrollStore,
    private readonly proofs: PayrollProofStorage,
  ) {}
  async record(
    user: AuthenticatedUser,
    id: string,
    dto: RecordPayrollPaymentDto,
    file?: PaymentProofUpload,
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
    let stored: Awaited<ReturnType<PayrollProofStorage['store']>> | undefined;
    try {
      await this.store.db.transaction(async (m) => {
        const payroll = await this.store.lock(m, user.tenantId, id);
        const existing = await m.findOneBy(PayrollPaymentEntity, {
          tenantId: user.tenantId,
          requestId: dto.requestId,
        });
        if (existing) {
          if (
            existing.payrollId !== id ||
            existing.requestHash !== requestHash ||
            existing.reversedAt
          )
            throw new ConflictException(
              'Kunci pembayaran telah digunakan. Buat permintaan pembayaran baru.',
            );
          return;
        }
        this.store.checkEditable(payroll, dto.version);
        if (jakartaDate(paidAt) < payroll.issuedDate)
          throw new BadRequestException(
            'Tanggal pembayaran tidak boleh sebelum tanggal terbit.',
          );
        if (await this.store.sourceChanged(payroll, m))
          throw new ConflictException(
            'Presensi berubah. Perbarui dari Presensi sebelum membayar.',
          );
        if (
          dto.method === 'bank_transfer' &&
          (!payroll.snapshot.bankName ||
            !payroll.snapshot.accountNumber ||
            !payroll.snapshot.accountName)
        )
          throw new BadRequestException(
            'Rekening tentor pada penggajian belum lengkap. Gunakan pembayaran tunai.',
          );
        const recorder =
          user.role === 'owner'
            ? await m.findOneBy(OwnerEntity, { userId: user.id })
            : await m.findOneBy(OperatorEntity, {
                userId: user.id,
                tenantId: user.tenantId,
              });
        const sources = await m.findBy(PayrollSourceEntity, {
          tenantId: user.tenantId,
          payrollId: id,
        });
        if (sources.length) {
          const sessions = await m.findBy(ClassSessionEntity, {
            tenantId: user.tenantId,
            id: In(sources.map((s) => s.sessionId)),
          });
          if (sessions.some((s) => s.lockedAt))
            throw new ConflictException(
              'Sesi sumber telah dikunci oleh proses lain.',
            );
          for (const session of sessions) {
            session.lockedAt = new Date();
            session.lockReason = `payroll:${id}`;
            session.version++;
          }
          await m.save(sessions);
        }
        if (file) stored = await this.proofs.store(file);
        await m.save(
          PayrollPaymentEntity,
          m.create(PayrollPaymentEntity, {
            tenantId: user.tenantId,
            payrollId: id,
            requestId: dto.requestId,
            requestHash,
            snapshot: await this.store.slip(payroll, m),
            amount: payroll.total,
            paidAt,
            paidDate: jakartaDate(paidAt),
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
        payroll.paidAt = paidAt;
        payroll.version++;
        await m.save(payroll);
        await this.store.event(m, payroll, 'payment_recorded', user.id, {
          amount: payroll.total,
          method: dto.method,
          paidAt: dto.paidAt,
        });
      });
    } catch (error: unknown) {
      if (stored) await this.proofs.remove(stored.key);
      if (isDuplicateEntryError(error))
        throw new ConflictException(
          'Kunci pembayaran telah digunakan oleh transaksi lain.',
        );
      throw error;
    }
    return this.store.detail(user.tenantId, id);
  }
  async reverse(
    user: AuthenticatedUser,
    id: string,
    paymentId: string,
    dto: ReversePayrollPaymentDto,
  ) {
    await this.store.db.transaction(async (m) => {
      const p = await this.store.lock(m, user.tenantId, id);
      if (p.version !== dto.version)
        throw new ConflictException(
          'Penggajian berubah. Muat ulang sebelum membatalkan.',
        );
      const payment = await m.findOneBy(PayrollPaymentEntity, {
        id: paymentId,
        tenantId: user.tenantId,
        payrollId: id,
      });
      if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan.');
      if (payment.reversedAt || !p.paidAt)
        throw new ConflictException('Pembayaran sudah dibatalkan.');
      payment.reversedAt = new Date();
      payment.reversalReason = dto.reason;
      await m.save(payment);
      const sources = await m.findBy(PayrollSourceEntity, {
        tenantId: user.tenantId,
        payrollId: id,
      });
      if (sources.length) {
        const sessions = await m.findBy(ClassSessionEntity, {
          tenantId: user.tenantId,
          id: In(sources.map((s) => s.sessionId)),
          lockReason: `payroll:${id}`,
        });
        for (const session of sessions) {
          session.lockedAt = null;
          session.lockReason = null;
          session.version++;
        }
        await m.save(sessions);
        // Lock/unlock itself does not change payable content. Attendance edits afterwards do.
        const versions = new Map(sessions.map((s) => [s.id, s.version]));
        for (const source of sources)
          source.sessionVersion =
            versions.get(source.sessionId) ?? source.sessionVersion;
        await m.save(sources);
      }
      p.paidAt = null;
      p.version++;
      await m.save(p);
      await this.store.event(m, p, 'payment_reversed', user.id, {
        paymentId,
        reason: dto.reason,
      });
    });
    return this.store.detail(user.tenantId, id);
  }
  async payment(tenantId: string, id: string, paymentId: string) {
    const payment = await this.store.db
      .getRepository(PayrollPaymentEntity)
      .createQueryBuilder('p')
      .addSelect('p.proofKey')
      .where('p.tenant_id=:tenantId AND p.payroll_id=:id AND p.id=:paymentId', {
        tenantId,
        id,
        paymentId,
      })
      .getOne();
    if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan.');
    return payment;
  }
  async proof(tenantId: string, id: string, paymentId: string) {
    const payment = await this.payment(tenantId, id, paymentId);
    if (!payment.proofKey)
      throw new NotFoundException('Bukti pembayaran tidak ditemukan.');
    return {
      buffer: await this.proofs.read(payment.proofKey),
      mime: payment.proofMime ?? 'application/octet-stream',
    };
  }
}
