export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

export type Order = {
  readonly id: string;
  readonly status: OrderStatus;
  readonly totalCents: number;
};
