import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { ReportsService } from './reports.service.js';
import { attendance, studentProjection } from './report-rules.js';

@Injectable()
export class ReportPdfService {
  constructor(private readonly reports: ReportsService) {}
  async generate(
    user: AuthenticatedUser,
    groupId: string,
    period: string,
    studentId?: string,
  ) {
    const detail = await this.reports.detail(user, groupId, period);
    const sections = detail.contributions.flatMap((c) => {
      if (!c.published?.snapshot) return [];
      const projected = studentId
        ? studentProjection(c.published.snapshot, c.published.notes, studentId)
        : { snapshot: c.published.snapshot, notes: c.published.notes };
      return projected.snapshot.sessions.length
        ? [
            {
              ...projected,
              content: c.published.content,
              number: c.published.number,
              publishedAt: c.published.publishedAt,
            },
          ]
        : [];
    });
    const first = sections[0];
    if (!first)
      throw new NotFoundException(
        'Belum ada laporan terbit untuk kelompok atau siswa ini.',
      );
    const student = first.snapshot.sessions
      .flatMap((s) => s.students)
      .find((s) => s.id === studentId);
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: 'Laporan Perkembangan ' + period,
        Author: first.snapshot.tenantName,
      },
    });
    const chunks: Buffer[] = [];
    const completed = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    doc.font('Helvetica-Bold').fontSize(20).text(first.snapshot.tenantName);
    doc.moveDown().fontSize(16).text('Laporan Perkembangan Belajar');
    doc
      .font('Helvetica')
      .fontSize(11)
      .text(first.snapshot.groupName + ' / ' + period);
    doc.text(
      student
        ? student.name + ' / ' + student.school + ' / ' + student.educationLevel
        : 'Untuk internal - laporan kelompok',
    );
    doc.text(
      detail.status === 'published'
        ? 'Terbit lengkap'
        : 'Terbit sebagian: ' +
            detail.published +
            '/' +
            detail.required +
            ' tentor',
    );
    for (const section of sections) {
      doc.moveDown();
      if (doc.y > 620) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).text(section.snapshot.tutorName);
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(section.snapshot.subject + ' / Versi ' + section.number);
      for (const [label, value] of [
        ['Materi pembelajaran', section.content.material],
        ['Perkembangan dan penguasaan konsep', section.content.progress],
        ['Peningkatan dan tindak lanjut', section.content.followUp],
        ['Catatan untuk orang tua', section.content.parentNote],
      ]) {
        if (!value) continue;
        if (doc.y > 660) doc.addPage();
        doc.moveDown(0.6).font('Helvetica-Bold').text(label);
        doc.font('Helvetica').text(value, { paragraphGap: 4 });
      }
      const counts = attendance(section.snapshot.sessions);
      doc
        .moveDown()
        .font('Helvetica-Bold')
        .text('Presensi: ' + counts.sessions + ' sesi');
      doc
        .font('Helvetica')
        .text(
          'Hadir ' +
            counts.present +
            ' / Izin ' +
            counts.excused +
            ' / Sakit ' +
            counts.sick +
            ' / Alpa ' +
            counts.absent +
            ' / Kehadiran ' +
            (counts.percentage ?? 0) +
            '%',
        );
      for (const note of section.notes) {
        const target = section.snapshot.sessions
          .flatMap((s) => s.students)
          .find((s) => s.id === note.studentId);
        if (!target) continue;
        if (doc.y > 660) doc.addPage();
        doc
          .moveDown()
          .font('Helvetica-Bold')
          .text('Catatan khusus: ' + target.name);
        doc.font('Helvetica').text(note.note);
      }
    }
    doc.end();
    return {
      buffer: await completed,
      filename: 'laporan-' + period + '-' + (studentId ?? groupId) + '.pdf',
    };
  }
}
