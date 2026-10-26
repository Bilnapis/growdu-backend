import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  SessionRecordDto,
  ConfigurationInputDto,
} from './dto/session-input.dto.js';
describe('session input validation', () => {
  it('rejects blank topics, invalid attendance, and duplicate students', async () => {
    const value = plainToInstance(SessionRecordDto, {
      version: 1,
      topic: '  ',
      attendance: [
        {
          studentId: 'b1d2f584-849f-4a8b-a526-02f24c88da00',
          status: 'unknown',
        },
        {
          studentId: 'b1d2f584-849f-4a8b-a526-02f24c88da00',
          status: 'present',
        },
      ],
    });
    const errors = await validate(value);
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['topic', 'attendance']),
    );
  });
  it('rejects timestamps and impossible dates in configuration boundaries', async () => {
    const errors = await validate(
      plainToInstance(ConfigurationInputDto, {
        effectiveFrom: '2026-02-30',
        effectiveUntil: '2026-10-01T00:00:00Z',
        schedules: [],
        studentIds: [],
      }),
    );
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['effectiveFrom', 'effectiveUntil']),
    );
  });
});
