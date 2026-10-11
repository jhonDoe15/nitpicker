export type InvoiceOptions = {
  readonly pickup: boolean;
  readonly country: string;
  readonly taxExempt: boolean;
  readonly discountCodes: readonly string[];
};

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

export function readInvoiceOptions(order: unknown): InvoiceOptions {
  const customer = field(order, 'customer');
  const codes = field(order, 'discountCodes');
  return {
    pickup: field(order, 'pickup') === true,
    country: String(field(customer, 'country')),
    taxExempt: field(customer, 'taxExempt') === true,
    discountCodes: Array.isArray(codes) ? codes.map((code) => String(code)) : [],
  };
}
