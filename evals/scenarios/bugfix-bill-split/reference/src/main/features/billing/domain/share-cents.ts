export function shareCents(totalCents: number, count: number, position: number): number {
  const base = Math.floor(totalCents / count);
  return position < totalCents % count ? base + 1 : base;
}
