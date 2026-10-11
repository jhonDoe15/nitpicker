import { z } from 'zod';
import type { Verdict } from '../domain/policy.js';

const PRICE_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u;

function toCents(text: string): number {
  const fractionDigits = text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
  return Number(text.replace('.', '')) * 10 ** (2 - fractionDigits);
}

const priceSchema = z
  .string()
  .trim()
  .regex(PRICE_PATTERN)
  .transform(toCents)
  .refine((cents) => Number.isSafeInteger(cents));

export function parsePrice(body: string): Verdict {
  const parsed = priceSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: 'failed', reason: 'bad-body' };
  }
  return { kind: 'ok', cents: parsed.data };
}
