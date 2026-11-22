import { describe, expect, it } from 'vitest';
import {
  attendance,
  generationDate,
  initialGenerationDate,
  readyToPublish,
  reportStatus,
  shiftMonth,
  sourceFingerprint,
  studentProjection,
} from './report-rules.js';
import type { ReportSnapshot } from './report-types.js';

const snapshot: ReportSnapshot = {
  tenantName: 'Bimbel',
  groupName: 'Aljabar',
  tutorName: 'Tentor',
  subject: 'Matematika',
  sessions: [
    {
      id: 'one',
      date: '2026-09-01',
      version: 1,
      status: 'completed',
      students: [
        {
          id: 'a',
          name: 'Alice',
          school: 'SMA',
          educationLevel: '10',
          status: 'present',
        },
        {
          id: 'b',
          name: 'Bob',
          school: 'SMP',
          educationLevel: '9',
          status: 'sick',
        },
      ],
    },
    {
      id: 'two',
      date: '2026-09-08',
      version: 1,
      status: 'scheduled',
      students: [
        {
          id: 'a',
          name: 'Alice',
          school: 'SMA',
          educationLevel: '10',
          status: null,
        },
      ],
    },
  ],
};
describe('Learning report rules', () => {
  it('clamps generation days in February and shifts reporting months across years', () => {
    expect(generationDate('2028-02', 31)).toBe('2028-02-29');
    expect(generationDate('2027-02', 29)).toBe('2027-02-28');
    expect(generationDate('2026-04', 31)).toBe('2026-04-30');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(initialGenerationDate('2026-11-22', 1)).toBe('2026-11-01');
    expect(initialGenerationDate('2026-11-22', 25)).toBe('2026-11-25');
  });
  it('distinguishes unfilled, draft, partial, and complete groups', () => {
    expect(reportStatus(2, 0, 0)).toBe('unfilled');
    expect(reportStatus(2, 2, 0)).toBe('draft');
    expect(reportStatus(2, 1, 1)).toBe('partially_published');
    expect(reportStatus(2, 1, 2)).toBe('published');
    expect(reportStatus(0, 0, 0)).toBe('unfilled');
  });
  it('counts actual roster opportunities and keeps missing attendance separate', () => {
    expect(attendance(snapshot.sessions)).toEqual({
      present: 1,
      sick: 1,
      absent: 0,
      excused: 0,
      pending: 1,
      recorded: 2,
      sessions: 2,
      percentage: 50,
    });
    expect(attendance([]).percentage).toBeNull();
  });
  it('requires content, sessions, full rosters, and completed attendance to publish', () => {
    const content = {
      material: 'Aljabar',
      progress: 'Baik',
      followUp: 'Latihan',
      parentNote: '',
    };
    expect(readyToPublish(content, snapshot.sessions)).toBe(false);
    expect(readyToPublish(content, snapshot.sessions.slice(0, 1))).toBe(true);
    expect(
      readyToPublish(
        { ...content, progress: '  ' },
        snapshot.sessions.slice(0, 1),
      ),
    ).toBe(false);
    expect(readyToPublish(content, [])).toBe(false);
    expect(
      readyToPublish(content, [{ ...snapshot.sessions[0], students: [] }]),
    ).toBe(false);
    expect(
      readyToPublish(content, [
        {
          ...snapshot.sessions[0],
          students: [{ ...snapshot.sessions[0].students[0], status: null }],
        },
      ]),
    ).toBe(false);
  });
  it('removes all other students and their notes before rendering a student PDF', () => {
    const result = studentProjection(
      snapshot,
      [
        { studentId: 'a', note: 'Alice private' },
        { studentId: 'b', note: 'Bob private' },
      ],
      'a',
    );
    expect(result.notes).toEqual([{ studentId: 'a', note: 'Alice private' }]);
    expect(
      result.snapshot.sessions.flatMap((s) => s.students).map((s) => s.id),
    ).toEqual(['a', 'a']);
    expect(JSON.stringify(result)).not.toContain('Bob');
    expect(snapshot.sessions[0].students).toHaveLength(2);
    expect(
      studentProjection(snapshot, [], 'missing').snapshot.sessions,
    ).toEqual([]);
    expect(sourceFingerprint(snapshot)).not.toEqual(
      sourceFingerprint({ ...snapshot, sessions: [] }),
    );
  });
});
