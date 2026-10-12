import { contains } from './date-range.js';
import type { DateRange } from './date-range.js';
import type { Sale } from './sale.js';

export type Row = {
  readonly product: string;
  readonly units: number;
  readonly revenueCents: number;
};

function rowOf(product: string, sales: readonly Sale[]): Row {
  const own: readonly Sale[] = sales.filter((sale) => sale.product === product);
  return {
    product,
    units: own.reduce((sum, sale) => sum + sale.quantity, 0),
    revenueCents: own.reduce((sum, sale) => sum + sale.quantity * sale.unitPriceCents, 0),
  };
}

function byRevenueThenName(a: Row, b: Row): number {
  const byRevenue = b.revenueCents - a.revenueCents;
  if (byRevenue !== 0) {
    return byRevenue;
  }
  return a.product.localeCompare(b.product, 'en');
}

export function summarizeSales(sales: readonly Sale[], range: DateRange): readonly Row[] {
  const inRange: readonly Sale[] = sales.filter((sale) => contains(range, sale.date));
  const products: readonly string[] = [...new Set(inRange.map((sale) => sale.product))];
  return products.map((product) => rowOf(product, inRange)).toSorted(byRevenueThenName);
}
