export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled' | 'on-hold';

export type Order = {
  readonly id: string;
  readonly status: OrderStatus;
  readonly totalCents: number;
  readonly holdReason?: string;
};
