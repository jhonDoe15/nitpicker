export function taxRateFor(country: string): number {
  switch (country) {
    case 'US':
      return 0.08;
    case 'DE':
      return 0.19;
    case 'GB':
      return 0.2;
    default:
      return 0;
  }
}

export function taxFor(amountCents: number, country: string): number {
  return Math.round(amountCents * taxRateFor(country));
}
