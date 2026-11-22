import { createHash } from 'node:crypto';
import { billingDueDate } from '../common/jakarta-date.js';
import type {
  ReportContent,
  ReportNote,
  ReportSession,
  ReportSnapshot,
  ReportStatus,
} from './report-types.js';

export function shiftMonth(period: string, offset: number): string {
  const date = new Date(period + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
export function generationDate(month: string, day: number): string {
  return billingDueDate(month, day);
}
export function initialGenerationDate(today: string, day: number): string {
  // A newly activated schedule starts in this month, never backfills older history.
  return generationDate(today.slice(0, 7), day);
}
export function reportStatus(
  required: number,
  drafts: number,
  published: number,
): ReportStatus {
  if (required > 0 && published === required) return 'published';
  if (published > 0) return 'partially_published';
  return drafts > 0 ? 'draft' : 'unfilled';
}
export function attendance(sessions: ReportSession[]) {
  const counts = { present: 0, excused: 0, sick: 0, absent: 0, pending: 0 };
  for (const session of sessions)
    for (const student of session.students) {
      counts[
        session.status === 'completed' && student.status
          ? student.status
          : 'pending'
      ]++;
    }
  const recorded =
    counts.present + counts.excused + counts.sick + counts.absent;
  return {
    ...counts,
    sessions: sessions.length,
    recorded,
    percentage: recorded
      ? Math.round((counts.present / recorded) * 1000) / 10
      : null,
  };
}
export function readyToPublish(
  content: ReportContent,
  sessions: ReportSession[],
): boolean {
  return (
    Boolean(
      content.material.trim() &&
      content.progress.trim() &&
      content.followUp.trim(),
    ) &&
    sessions.length > 0 &&
    sessions.every(
      (s) =>
        s.status === 'completed' &&
        s.students.length > 0 &&
        s.students.every((student) => student.status !== null),
    )
  );
}
export function sourceFingerprint(snapshot: ReportSnapshot): string {
  // MySQL JSON normalizes key order; object insertion order is not source drift.
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (typeof value === 'object' && value !== null)
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    return value;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(snapshot)))
    .digest('hex');
}
/** A student export must be projected before it reaches the PDF renderer. */
export function studentProjection(
  snapshot: ReportSnapshot,
  notes: ReportNote[],
  studentId: string,
) {
  const sessions = snapshot.sessions
    .filter((s) => s.students.some((student) => student.id === studentId))
    .map((s) => ({
      ...s,
      students: s.students.filter((student) => student.id === studentId),
    }));
  return {
    snapshot: { ...snapshot, sessions },
    notes: notes.filter((note) => note.studentId === studentId),
  };
}
