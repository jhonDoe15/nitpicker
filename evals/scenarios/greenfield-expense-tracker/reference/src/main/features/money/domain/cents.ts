export type CentsParse =
  | { readonly kind: 'cents'; readonly value: number }
  | { readonly kind: 'invalid-amount' }
  | { readonly kind: 'not-positive' };

export function parseCents(text: string): CentsParse {
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)) {
    return { kind: 'invalid-amount' };
  }
  const dot = text.indexOf('.');
  const whole = dot === -1 ? text : text.slice(0, dot);
  const fraction = dot === -1 ? '' : text.slice(dot + 1);
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (value === 0) {
    return { kind: 'not-positive' };
  }
  return { kind: 'cents', value };
}

export function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  return `${String(whole)}.${String(fraction).padStart(2, '0')}`;
}
