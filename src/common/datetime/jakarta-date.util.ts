export function getJakartaDayOfWeek(date = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date);

  const index = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
    weekday,
  );

  return index >= 0 ? index + 1 : 1;
}
