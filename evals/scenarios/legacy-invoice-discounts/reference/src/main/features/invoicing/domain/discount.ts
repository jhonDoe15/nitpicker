import { formatMoney } from './format-money.js';

type DiscountCode =
  | { readonly name: string; readonly kind: 'percent'; readonly percent: number }
  | { readonly name: string; readonly kind: 'fixed'; readonly cents: number };

export type DiscountOutcome = {
  readonly discountCents: number;
  readonly lines: readonly string[];
};

const KNOWN_CODES: readonly DiscountCode[] = [
  { name: 'SAVE10', kind: 'percent', percent: 10 },
  { name: 'SAVE25', kind: 'percent', percent: 25 },
  { name: 'FIVEOFF', kind: 'fixed', cents: 500 },
  { name: 'TWENTY', kind: 'fixed', cents: 2000 },
];

function discountAmount(code: DiscountCode, subtotalCents: number): number {
  switch (code.kind) {
    case 'percent':
      return Math.floor((subtotalCents * code.percent) / 100);
    case 'fixed':
      return Math.min(code.cents, subtotalCents);
  }
}

function applySingleCode(given: string, subtotalCents: number): DiscountOutcome {
  const code = KNOWN_CODES.find(({ name }) => name === given.toUpperCase());
  if (code === undefined) {
    return { discountCents: 0, lines: [`Unknown discount code: ${given}`] };
  }
  const discountCents = discountAmount(code, subtotalCents);
  return { discountCents, lines: [`Discount ${code.name}: -${formatMoney(discountCents)}`] };
}

export function applyDiscountCodes(
  codes: readonly string[],
  subtotalCents: number,
): DiscountOutcome {
  const [code] = codes;
  if (code === undefined) {
    return { discountCents: 0, lines: [] };
  }
  if (codes.length > 1) {
    return { discountCents: 0, lines: ['Only one discount code per invoice'] };
  }
  return applySingleCode(code, subtotalCents);
}
