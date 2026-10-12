export function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `$${dollars.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`;
}
