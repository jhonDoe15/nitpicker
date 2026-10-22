const US_TAX_RATE = 0.08;
const DE_TAX_RATE = 0.19;
const GB_TAX_RATE = 0.2;

export function taxRateFor(country: string): number {
  switch (country) {
    case 'US':
      return US_TAX_RATE;
    case 'DE':
      return DE_TAX_RATE;
    case 'GB':
      return GB_TAX_RATE;
    default:
      return 0;
  }
}

export function taxFor(amountCents: number, country: string): number {
  return Math.round(amountCents * taxRateFor(country));
}
