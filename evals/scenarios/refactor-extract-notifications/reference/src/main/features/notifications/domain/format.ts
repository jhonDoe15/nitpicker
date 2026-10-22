const monthNames = 'JanFebMarAprMayJunJulAugSepOctNovDec';
const MONTH_NAME_LENGTH = 3;
const MS_PER_MINUTE = 60_000;
const YEAR_START = 0;
const YEAR_END = 4;
const MONTH_START = 5;
const MONTH_END = 7;
const DAY_START = 8;
const DAY_END = 10;

export function formatDate(at: string, utcOffsetMinutes: number): string {
  const local = new Date(Date.parse(at) + utcOffsetMinutes * MS_PER_MINUTE).toISOString();
  const monthStart = (Number(local.slice(MONTH_START, MONTH_END)) - 1) * MONTH_NAME_LENGTH;
  const month = monthNames.slice(monthStart, monthStart + MONTH_NAME_LENGTH);
  const day = Number(local.slice(DAY_START, DAY_END));
  return `${String(day)} ${month} ${local.slice(YEAR_START, YEAR_END)}`;
}

export function formatMoney(cents: number): string {
  return `$${String(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`;
}
