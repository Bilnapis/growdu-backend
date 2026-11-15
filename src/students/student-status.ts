import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { nextBillingPeriod } from '../common/jakarta-date.js';
import type { StudentEntity } from './entities/student.entity.js';

export function refreshStudentStatus(
  student: StudentEntity,
  now = new Date(),
): void {
  const previous = student.status;
  student.status =
    student.administrativeStatus === EntityStatus.Inactive ||
    student.billingBlocked
      ? EntityStatus.Inactive
      : EntityStatus.Active;
  if (
    previous === EntityStatus.Inactive &&
    student.status === EntityStatus.Active
  ) {
    student.nextInvoicePeriod = nextBillingPeriod(now);
  }
}

export function setAdministrativeStatus(
  student: StudentEntity,
  status: EntityStatus,
): void {
  student.administrativeStatus = status;
  refreshStudentStatus(student);
}
