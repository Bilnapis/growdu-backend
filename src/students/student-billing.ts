import { nextBillingPeriod } from '../common/jakarta-date.js';
import type { StudentEntity } from './entities/student.entity.js';

/** Apply the same monthly-fee policy from registration and invoice settings. */
export function setStudentMonthlyFee(
  student: StudentEntity,
  monthlyFee: number | null,
  now = new Date(),
): void {
  student.monthlyFee = monthlyFee;
  if (monthlyFee === null) student.nextInvoicePeriod = null;
  else student.nextInvoicePeriod ??= nextBillingPeriod(now);
}
