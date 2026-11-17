import { Injectable, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import PDFDocument from 'pdfkit';
import { PayrollPaymentEntity } from './entities/payroll.entity.js';
import { PayrollStore } from './payroll-store.service.js';

@Injectable()
export class PayrollPdfService {
  constructor(private readonly store: PayrollStore) {}
  async generate(tenantId: string, id: string, paymentId?: string) {
    const payment = await this.store.db.manager.findOneBy(
      PayrollPaymentEntity,
      {
        tenantId,
        payrollId: id,
        ...(paymentId ? { id: paymentId } : { reversedAt: IsNull() }),
      },
    );
    if (!payment)
      throw new NotFoundException('Slip pembayaran tidak ditemukan.');
    const slip = payment.snapshot;
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: slip.number, Author: slip.tenantName },
    });
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    const rupiah = (value: string) =>
      `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value))}`;
    doc.font('Helvetica-Bold').fontSize(22).text(slip.tenantName);
    if (slip.tenantAddress)
      doc.font('Helvetica').fontSize(10).text(slip.tenantAddress);
    doc.moveDown().font('Helvetica-Bold').fontSize(18).text('SLIP GAJI TENTOR');
    if (payment.reversedAt) doc.fontSize(14).text('PEMBAYARAN DIBATALKAN');
    doc
      .font('Helvetica')
      .fontSize(11)
      .text(slip.number)
      .text(`Periode: ${slip.startDate} - ${slip.endDate}`)
      .text(`Tanggal gaji: ${slip.payDate}`);
    doc.moveDown().font('Helvetica-Bold').text(slip.tutorName);
    doc
      .font('Helvetica')
      .text(slip.subject ?? '-')
      .text(`${slip.tutorPhone} / ${slip.tutorEmail ?? '-'}`);
    doc.moveDown();
    for (const item of slip.items) {
      const quantity = item.sourceCount + item.sessionAdjustment;
      const text = `${item.description}${item.kind === 'teaching' ? ` (${quantity} sesi x ${rupiah(item.rate)})` : ''}`;
      const height =
        Math.max(doc.heightOfString(text, { width: 345 }), 16) + 16;
      if (doc.y + height > 720) doc.addPage();
      const y = doc.y;
      doc.fontSize(10).text(text, 48, y, { width: 345 });
      doc.text(rupiah(item.subtotal), 400, y, { width: 145, align: 'right' });
      doc.y = y + height;
    }
    if (doc.y > 560) doc.addPage();
    doc
      .moveDown()
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(`Total Gaji: ${rupiah(slip.total)}`, 48, doc.y, {
        width: 497,
        align: 'right',
      });
    doc
      .moveDown()
      .font('Helvetica')
      .fontSize(11)
      .text(
        `Dibayar: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(payment.paidAt)} WIB`,
      );
    doc
      .text(
        `Metode: ${payment.method === 'cash' ? 'Tunai' : 'Transfer bank/e-wallet'}`,
      )
      .text(`Referensi: ${payment.reference ?? '-'}`)
      .text(`Dicatat oleh: ${payment.recordedByName}`);
    if (slip.accountNumber)
      doc.text(
        `Rekening: ${slip.bankName ?? '-'} ${slip.accountNumber} a.n. ${slip.accountName ?? '-'}`,
      );
    if (payment.reversedAt)
      doc.text(`Alasan pembatalan: ${payment.reversalReason ?? '-'}`);
    doc.end();
    return {
      buffer: await complete,
      filename: `${slip.number}-${payment.id}${payment.reversedAt ? '-dibatalkan' : ''}.pdf`,
    };
  }
}
