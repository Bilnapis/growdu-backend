import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { InvoiceStore } from './invoice-store.service.js';

const rupiah = (value: number) =>
  `Rp ${new Intl.NumberFormat('id-ID').format(value)}`;
const date = (value: string | Date) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(
    typeof value === 'string' ? new Date(`${value}T00:00:00+07:00`) : value,
  );

@Injectable()
export class InvoicePdfService {
  constructor(private readonly store: InvoiceStore) {}
  async generate(
    tenantId: string,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.store.detail(tenantId, id);
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: invoice.number, Author: invoice.snapshot.tenantName },
    });
    const chunks: Buffer[] = [];
    const completed = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor('#0f172a')
      .text(invoice.snapshot.tenantName);
    if (invoice.snapshot.tenantAddress)
      doc.font('Helvetica').fontSize(10).text(invoice.snapshot.tenantAddress);
    doc.moveDown().font('Helvetica-Bold').fontSize(18).text('INVOICE SPP');
    doc
      .font('Helvetica')
      .fontSize(11)
      .text(invoice.number)
      .text(`Periode: ${invoice.period}`)
      .text(`Terbit: ${date(invoice.issuedDate)}`)
      .text(`Jatuh tempo: ${date(invoice.dueDate)}`);
    doc
      .moveDown()
      .font('Helvetica-Bold')
      .text(`${invoice.studentName} (${invoice.snapshot.studentCode})`);
    doc
      .font('Helvetica')
      .text(`${invoice.snapshot.educationLevel} - ${invoice.snapshot.school}`);
    doc.text(
      `Kelompok: ${invoice.groups.map((g) => g.name).join(', ') || '-'}`,
    );
    doc.text(`Orang tua/wali: ${invoice.snapshot.parentName ?? '-'}`);
    doc.text(
      `Kontak: ${invoice.snapshot.parentPhone ?? '-'} / ${invoice.snapshot.parentEmail ?? '-'}`,
    );
    doc.moveDown();
    for (const item of invoice.items) {
      const text = `${item.description} (${item.quantity}${item.kind === 'tuition' ? ' bulan' : ''})`;
      const height =
        Math.max(doc.heightOfString(text, { width: 330 }), 16) + 14;
      if (doc.y + height > 730) doc.addPage();
      const y = doc.y;
      doc.fontSize(10).text(text, 48, y, { width: 330 });
      doc
        .font('Helvetica-Bold')
        .text(rupiah(item.subtotal), 385, y, { width: 160, align: 'right' });
      doc.font('Helvetica');
      doc.y = y + height;
    }
    if (doc.y > 620) doc.addPage();
    doc
      .moveDown()
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(`Total: ${rupiah(invoice.total)}`, { align: 'right' });
    doc
      .moveDown()
      .fontSize(11)
      .text(
        `Status: ${invoice.status === 'paid' ? 'LUNAS' : invoice.status === 'overdue' ? 'TERLAMBAT' : 'BELUM BAYAR'}`,
      );
    const payment = invoice.payments.find((p) => !p.reversedAt);
    if (payment) {
      doc
        .font('Helvetica')
        .text(`Dibayar: ${date(payment.paidAt)}`)
        .text(
          `Metode: ${payment.method === 'cash' ? 'Tunai' : 'Transfer bank'}`,
        )
        .text(`Referensi: ${payment.reference ?? '-'}`)
        .text(`Dicatat oleh: ${payment.recordedByName}`);
    }
    const account = invoice.snapshot.bankAccount;
    if (account)
      doc
        .moveDown()
        .font('Helvetica')
        .text(
          `Rekening tujuan: ${account.bankName}${account.branch ? ` - ${account.branch}` : ''}`,
        )
        .text(account.accountNumber)
        .text(`a.n. ${account.accountHolder}`);
    doc.end();
    return { buffer: await completed, filename: `${invoice.number}.pdf` };
  }
}
