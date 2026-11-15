/** Calendar dates are kept as ISO strings; the billing clock always uses WIB. */
export function jakartaDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function nextBillingPeriod(now = new Date()): string {
  const date = jakartaDate(now);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function shiftCalendarDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function billingDueDate(period: string, day: number): string {
  const last = new Date(
    Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0),
  ).getUTCDate();
  return `${period}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
