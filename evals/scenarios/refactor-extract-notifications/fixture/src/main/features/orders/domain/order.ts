type OrderLine = {
  readonly name: string;
  readonly quantity: number;
  readonly unitCents: number;
};

export type Order = {
  readonly id: string;
  readonly placedAt: string;
  readonly payBy: string;
  readonly shippingCents: number;
  readonly lines: readonly OrderLine[];
};

export function orderTotalCents(order: Order): number {
  const items = order.lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0);
  return items + order.shippingCents;
}
