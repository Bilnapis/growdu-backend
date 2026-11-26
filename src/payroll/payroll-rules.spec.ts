import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { jakartaDate } from '../common/jakarta-date.js';
import {
  firstCycle,
  followingCycle,
  itemSubtotal,
  moneyMinor,
  moneyString,
  nextPayDate,
  payrollStatus,
  payrollTotal,
} from './payroll-rules.js';
import {
  GeneratePayrollDto,
  GeneratePayrollMonthDto,
  RecordPayrollPaymentDto,
  UpdatePayrollSettingsDto,
} from './dto/payroll-input.dto.js';

describe('payroll calculation', () => {
  const teaching = {
    kind: 'teaching' as const,
    sourceCount: 7,
    sessionAdjustment: 2,
    rate: '50000.25',
  };
  it('uses exact hundredths for teaching, manual corrections, additions and deductions', () => {
    expect(
      payrollTotal([
        teaching,
        {
          kind: 'addition',
          sourceCount: 0,
          sessionAdjustment: 0,
          rate: '100000.00',
        },
        {
          kind: 'deduction',
          sourceCount: 0,
          sessionAdjustment: 0,
          rate: '25000.01',
        },
      ]),
    ).toBe('525002.24');
    expect(itemSubtotal({ ...teaching, sourceCount: 8 })).toBe(50000250);
    expect(moneyString(-2500001)).toBe('-25000.01');
    expect(moneyMinor('0.10') + moneyMinor('0.20')).toBe(30);
  });
  it.each(['-1', '1e3', 'NaN', '1,25', '1.001', '1000000000000', ''])(
    'rejects unsafe money %s',
    (value) => expect(() => moneyMinor(value)).toThrow(),
  );
  it('rejects invalid session counts, zero rates, zero totals, and overflow', () => {
    expect(() =>
      itemSubtotal({ ...teaching, sessionAdjustment: -8 }),
    ).toThrow();
    expect(() => itemSubtotal({ ...teaching, sourceCount: 1.5 })).toThrow();
    expect(() => itemSubtotal({ ...teaching, rate: '0' })).toThrow();
    expect(() =>
      payrollTotal([{ ...teaching, sourceCount: 0, sessionAdjustment: 0 }]),
    ).toThrow();
    expect(() =>
      payrollTotal([
        { ...teaching, sourceCount: 100_000, rate: '999999999999.99' },
      ]),
    ).toThrow();
  });
});
describe('payroll calendar and status', () => {
  it('settles the preceding calendar month, across months and years', () => {
    expect(firstCycle('2026-11-05', 5)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      payDate: '2026-11-05',
    });
    expect(followingCycle('2026-12-05', 5)).toEqual({
      startDate: '2026-12-01',
      endDate: '2026-12-31',
      payDate: '2027-01-05',
    });
  });
  it('clamps short months without drifting the configured payday', () => {
    expect(firstCycle('2028-02-01', 31)).toEqual({
      startDate: '2028-01-01',
      endDate: '2028-01-31',
      payDate: '2028-02-29',
    });
    expect(followingCycle('2027-01-31', 31).payDate).toBe('2027-02-28');
    expect(followingCycle('2027-02-28', 31).payDate).toBe('2027-03-31');
  });
  it.each([
    ['2027-03-05', '2027-02-01', '2027-02-28'],
    ['2028-03-05', '2028-02-01', '2028-02-29'],
    ['2026-05-05', '2026-04-01', '2026-04-30'],
  ])('covers the whole session month for %s', (payDate, startDate, endDate) => {
    expect(firstCycle(payDate, 5)).toEqual({ startDate, endDate, payDate });
  });
  it('initializes at the nearest payday that has not passed', () => {
    expect(nextPayDate('2026-11-15', 10)).toBe('2026-12-10');
    expect(nextPayDate('2026-11-15', 20)).toBe('2026-11-20');
    expect(nextPayDate('2026-11-05', 5)).toBe('2026-11-05');
  });
  it('uses WIB at midnight and marks overdue only after payday', () => {
    expect(jakartaDate(new Date('2026-11-04T17:00:00Z'))).toBe('2026-11-05');
    expect(payrollStatus(null, '2026-11-05', '2026-11-05')).toBe('unpaid');
    expect(payrollStatus(null, '2026-11-05', '2026-11-06')).toBe('overdue');
    expect(payrollStatus(new Date(), '2026-11-05', '2026-11-06')).toBe('paid');
  });
});
describe('payroll transport validation', () => {
  it.each([
    { payday: 0, enabled: true },
    { payday: 32, enabled: true },
    { payday: 5.5, enabled: true },
    { payday: 5, enabled: 'yes' },
    { payday: 5 },
  ])('rejects invalid settings %j', async (input) =>
    expect(
      await validate(plainToInstance(UpdatePayrollSettingsDto, input)),
    ).not.toHaveLength(0),
  );
  it.each(['2026-00', '2026-13', '2026-1', '0000-01', '', null])(
    'rejects invalid session month %s',
    async (sessionMonth) => {
      expect(
        await validate(
          plainToInstance(GeneratePayrollMonthDto, { sessionMonth }),
        ),
      ).not.toHaveLength(0);
    },
  );
  it('requires a valid period and rejects unknown authority fields', async () => {
    expect(
      await validate(plainToInstance(GeneratePayrollDto, { periodId: 'bad' })),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdatePayrollSettingsDto, {
          payday: 5,
          enabled: true,
          tenantId: 'foreign',
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ),
    ).not.toHaveLength(0);
  });
  it('requires an explicit timezone and payment idempotency key', async () => {
    expect(
      await validate(
        plainToInstance(RecordPayrollPaymentDto, {
          version: 1,
          method: 'cash',
          paidAt: '2026-11-15T10:00:00',
        }),
      ),
    ).not.toHaveLength(0);
  });
});
