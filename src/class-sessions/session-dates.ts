export function jakartaDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function sessionDates(
  from: string,
  until: string,
  dayOfWeek: number,
): string[] {
  const result: string[] = [];
  for (let date = from; date <= until; date = shiftDate(date, 1)) {
    if ((new Date(`${date}T00:00:00Z`).getUTCDay() || 7) === dayOfWeek)
      result.push(date);
  }
  return result;
}

export function legacyEndDate(from: string): string {
  const date = new Date(`${from}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 7);
  date.setUTCDate(0);
  date.setUTCDate(Math.min(day, date.getUTCDate()));
  return date.toISOString().slice(0, 10);
}
