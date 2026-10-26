import { describe, expect, it } from 'vitest';
import {
  jakartaDate,
  legacyEndDate,
  sessionDates,
  shiftDate,
} from './session-dates.js';

describe('business calendar', () => {
  it('includes both boundary dates and never duplicates a date', () => {
    const dates = sessionDates('2026-09-01', '2026-09-15', 2);
    expect(dates).toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
    expect(new Set(dates).size).toBe(dates.length);
  });
  it('supports Sunday, leap day and empty ranges', () => {
    expect(sessionDates('2026-09-06', '2026-09-06', 7)).toEqual(['2026-09-06']);
    expect(sessionDates('2024-02-28', '2024-03-01', 4)).toEqual(['2024-02-29']);
    expect(sessionDates('2026-09-02', '2026-09-01', 2)).toEqual([]);
  });
  it('uses Jakarta instead of the server timezone', () => {
    expect(jakartaDate(new Date('2026-09-01T18:00:00Z'))).toBe('2026-09-02');
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('clamps the end to six calendar months', () => {
    expect(legacyEndDate('2026-08-31')).toBe('2027-02-28');
    expect(legacyEndDate('2026-09-15')).toBe('2027-03-15');
  });
});
