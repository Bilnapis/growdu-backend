import { BadRequestException } from '@nestjs/common';
import { billingDueDate, shiftCalendarDate } from '../common/jakarta-date.js';

export type PayrollStatus = 'paid' | 'unpaid' | 'overdue';
export type PayrollItemKind = 'teaching' | 'addition' | 'deduction';
export const MAX_MONEY_MINOR = 999_999_999_999_99;

/** All arithmetic uses integer hundredths; decimal strings are the wire/storage format. */
export function moneyMinor(value: string): number {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value))
    throw new BadRequestException(
      'Nominal harus berupa angka dengan maksimal dua desimal.',
    );
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > MAX_MONEY_MINOR)
    throw new BadRequestException('Nominal melebihi batas yang didukung.');
  return result;
}
export function moneyString(minor: number): string {
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MONEY_MINOR)
    throw new BadRequestException('Nominal melebihi batas yang didukung.');
  return `${minor < 0 ? '-' : ''}${Math.floor(Math.abs(minor) / 100)}.${String(Math.abs(minor) % 100).padStart(2, '0')}`;
}
export interface CalculationItem {
  kind: PayrollItemKind;
  sourceCount: number;
  sessionAdjustment: number;
  rate: string;
}
export function itemSubtotal(item: CalculationItem): number {
  const count =
    item.kind === 'teaching' ? item.sourceCount + item.sessionAdjustment : 1;
  if (!Number.isSafeInteger(count) || count < 0 || count > 100_000)
    throw new BadRequestException(
      'Jumlah sesi harus bulat, tidak negatif, dan maksimal 100.000.',
    );
  const rate = moneyMinor(item.rate);
  if (rate <= 0)
    throw new BadRequestException('Tarif atau nominal harus lebih dari nol.');
  const result = count * rate * (item.kind === 'deduction' ? -1 : 1);
  moneyString(result);
  return result;
}
export function payrollTotal(items: readonly CalculationItem[]): string {
  const result = items.reduce((sum, item) => sum + itemSubtotal(item), 0);
  if (result <= 0)
    throw new BadRequestException('Total gaji harus lebih dari nol.');
  return moneyString(result);
}
export function payrollStatus(
  paidAt: Date | null,
  payDate: string,
  today: string,
): PayrollStatus {
  return paidAt ? 'paid' : payDate < today ? 'overdue' : 'unpaid';
}
export function monthOffset(date: string, offset: number): string {
  const value = new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1 + offset,
      1,
    ),
  );
  return value.toISOString().slice(0, 7);
}
export function nextPayDate(
  today: string,
  day: number,
  start?: string,
): string {
  let candidate = billingDueDate(today.slice(0, 7), day);
  if (candidate < today || (start !== undefined && candidate <= start))
    candidate = billingDueDate(monthOffset(today, 1), day);
  return candidate;
}
export function firstCycle(today: string, day: number) {
  const payDate = nextPayDate(today, day);
  return {
    startDate: billingDueDate(monthOffset(payDate, -1), day),
    endDate: shiftCalendarDate(payDate, -1),
    payDate,
  };
}
export function followingCycle(previousPayDate: string, day: number) {
  const payDate = billingDueDate(monthOffset(previousPayDate, 1), day);
  return {
    startDate: previousPayDate,
    endDate: shiftCalendarDate(payDate, -1),
    payDate,
  };
}
