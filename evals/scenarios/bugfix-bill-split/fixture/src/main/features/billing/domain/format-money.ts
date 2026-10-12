export function formatMoney(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return `$${String(dollars)}.${rest < 10 ? '0' : ''}${String(rest)}`;
}
