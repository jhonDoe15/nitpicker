export type Subscription = {
  readonly id: string;
  readonly plan: string;
  readonly interval: 'monthly' | 'yearly';
  readonly seats: number;
  readonly seatPriceCents: number;
  readonly renewsOn: string;
};

export function subscriptionTotalCents(subscription: Subscription): number {
  return subscription.seats * subscription.seatPriceCents;
}
