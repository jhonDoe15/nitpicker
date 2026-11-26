type Resource = {
  create(params?: object, options?: { idempotencyKey?: string }): Promise<{ id: string }>;
  retrieve(id: string): Promise<{ id: string }>;
};
declare class Stripe {
  constructor(key: string);
  customers: Resource;
  paymentIntents: Resource;
}
export default Stripe;
