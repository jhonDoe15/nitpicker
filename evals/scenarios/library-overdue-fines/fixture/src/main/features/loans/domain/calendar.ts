const MILLISECONDS_PER_DAY = 86_400_000;

export function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY;
}
