import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import {
  billingDueDate,
  jakartaDate,
  nextBillingPeriod,
  shiftCalendarDate,
} from '../common/jakarta-date.js';
import { StudentEntity } from '../students/entities/student.entity.js';
import {
  refreshStudentStatus,
  setAdministrativeStatus,
} from '../students/student-status.js';
import {
  UpdateBillingProfileDto,
  UpdateInvoiceSettingsDto,
} from './dto/invoice-input.dto.js';
import { invoiceStatus, invoiceTotal } from './invoice-rules.js';
import { proofMime } from './invoice-proof-storage.service.js';

describe('SPP invoice rules', () => {
  it('keeps due day 1 payable through the end of WIB day 1 and blocks starting day 2 with zero grace', () => {
    const invoice = { paidAt: null, dueDate: '2026-12-01' };
    expect(jakartaDate(new Date('2026-12-01T16:59:59.999Z'))).toBe(
      '2026-12-01',
    );
    expect(
      invoiceStatus(invoice, jakartaDate(new Date('2026-12-01T16:59:59.999Z'))),
    ).toBe('unpaid');
    expect(
      invoiceStatus(invoice, jakartaDate(new Date('2026-12-01T17:00:00Z'))),
    ).toBe('overdue');
    expect(shiftCalendarDate(invoice.dueDate, 0 + 1)).toBe('2026-12-02');
    expect(
      invoiceStatus({ ...invoice, paidAt: new Date() }, '2099-01-01'),
    ).toBe('paid');
  });
  it('handles leap years, short months, year rollover and custom grace', () => {
    expect(billingDueDate('2028-02', 31)).toBe('2028-02-29');
    expect(billingDueDate('2027-02', 31)).toBe('2027-02-28');
    expect(shiftCalendarDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftCalendarDate('2026-11-10', 7 + 1)).toBe('2026-11-18');
    expect(nextBillingPeriod(new Date('2026-12-31T20:00:00Z'))).toBe('2027-02');
  });
  it('accepts grace zero and rejects invalid settings and fees', async () => {
    expect(
      await validate(
        plainToInstance(UpdateInvoiceSettingsDto, { dueDay: 1, graceDays: 0 }),
      ),
    ).toHaveLength(0);
    for (const settings of [
      { dueDay: 0, graceDays: 0 },
      { dueDay: 32, graceDays: 0 },
      { dueDay: 1, graceDays: -1 },
    ])
      expect(
        (await validate(plainToInstance(UpdateInvoiceSettingsDto, settings)))
          .length,
      ).toBeGreaterThan(0);
    expect(
      await validate(
        plainToInstance(UpdateBillingProfileDto, { monthlyFee: null }),
      ),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(UpdateBillingProfileDto, { monthlyFee: 0 }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(plainToInstance(UpdateBillingProfileDto, {}))).length,
    ).toBeGreaterThan(0);
  });
  it('computes adjustments without floating-point currency and prevents invalid totals', () => {
    const tuition = {
      kind: 'tuition' as const,
      quantity: 1,
      unitAmount: 450_000,
    };
    expect(
      invoiceTotal([
        tuition,
        { kind: 'discount', quantity: 1, unitAmount: 50_000 },
      ]),
    ).toBe(400_000);
    expect(
      invoiceTotal([
        tuition,
        { kind: 'charge', quantity: 2, unitAmount: 25_000 },
      ]),
    ).toBe(500_000);
    expect(() =>
      invoiceTotal([
        tuition,
        { kind: 'discount', quantity: 1, unitAmount: 450_000 },
      ]),
    ).toThrow();
    expect(() => invoiceTotal([tuition, tuition])).toThrow();
    expect(() => invoiceTotal([])).toThrow();
  });
  it('keeps manual suspension separate and resumes billing next month only after activation', () => {
    const student = Object.assign(new StudentEntity(), {
      status: EntityStatus.Inactive,
      administrativeStatus: EntityStatus.Inactive,
      billingBlocked: true,
      nextInvoicePeriod: '2026-01',
    });
    student.billingBlocked = false;
    refreshStudentStatus(student, new Date('2026-11-15T00:00:00Z'));
    expect(student.status).toBe(EntityStatus.Inactive);
    student.administrativeStatus = EntityStatus.Active;
    refreshStudentStatus(student, new Date('2026-11-15T00:00:00Z'));
    expect(student.status).toBe(EntityStatus.Active);
    expect(student.nextInvoicePeriod).toBe('2026-12');
    student.billingBlocked = true;
    setAdministrativeStatus(student, EntityStatus.Active);
    expect(student.status).toBe(EntityStatus.Inactive);
  });
  it('rejects text files disguised as proof images', () => {
    expect(() => proofMime(Buffer.from('<script>alert(1)</script>'))).toThrow();
    expect(() => proofMime(Buffer.from([0xff, 0xd8]))).toThrow();
  });
});
