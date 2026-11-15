import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { StudentEntity } from './entities/student.entity.js';
import { setStudentMonthlyFee } from './student-billing.js';

describe('student monthly SPP fee', () => {
  it('starts new billing next month using the WIB calendar across the year boundary', () => {
    const student = new StudentEntity();
    setStudentMonthlyFee(student, 450_000, new Date('2026-12-31T17:00:00Z'));
    expect(student).toMatchObject({
      monthlyFee: 450_000,
      nextInvoicePeriod: '2027-02',
    });
  });

  it('preserves the next invoice period when changing a configured fee', () => {
    const student = Object.assign(new StudentEntity(), {
      monthlyFee: 450_000,
      nextInvoicePeriod: '2026-11',
    });
    setStudentMonthlyFee(student, 550_000, new Date('2026-11-15T00:00:00Z'));
    expect(student).toMatchObject({
      monthlyFee: 550_000,
      nextInvoicePeriod: '2026-11',
    });
  });

  it('clears new billing without releasing an existing overdue suspension', () => {
    const student = Object.assign(new StudentEntity(), {
      monthlyFee: 450_000,
      nextInvoicePeriod: '2026-11',
      billingBlocked: true,
      administrativeStatus: EntityStatus.Active,
      status: EntityStatus.Inactive,
    });
    setStudentMonthlyFee(student, null);
    expect(student).toMatchObject({
      monthlyFee: null,
      nextInvoicePeriod: null,
      billingBlocked: true,
      status: EntityStatus.Inactive,
    });
  });
});
