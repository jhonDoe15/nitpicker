// Tax rates by country. Unknown countries pay no tax.
export class TaxCalculator {
  private rates: { [country: string]: number } = { US: 0.08, DE: 0.19, GB: 0.2 };
  private country: string;

  constructor(country: string) {
    this.country = country;
  }

  public rate(): number {
    const found = this.rates[this.country];
    if (found === undefined) {
      return 0;
    }
    return found;
  }

  public taxFor(amountCents: number): number {
    return Math.round(amountCents * this.rate());
  }
}
