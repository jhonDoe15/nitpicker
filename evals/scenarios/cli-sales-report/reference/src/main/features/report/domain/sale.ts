export type Sale = {
  readonly product: string;
  readonly date: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
};

export type Format = 'table' | 'csv';

export type Failure = { readonly kind: 'failure'; readonly messages: readonly string[] };
