const monthNames = 'JanFebMarAprMayJunJulAugSepOctNovDec';

export function formatDate(at: string, utcOffsetMinutes: number): string {
  const local = new Date(Date.parse(at) + utcOffsetMinutes * 60_000).toISOString();
  const monthStart = (Number(local.slice(5, 7)) - 1) * 3;
  const month = monthNames.slice(monthStart, monthStart + 3);
  return `${String(Number(local.slice(8, 10)))} ${month} ${local.slice(0, 4)}`;
}

export function formatMoney(cents: number): string {
  return `$${String(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`;
}
