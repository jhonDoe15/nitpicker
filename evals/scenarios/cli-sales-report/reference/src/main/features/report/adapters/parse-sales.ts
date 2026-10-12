import { z } from 'zod';
import type { Failure, Sale } from '../domain/sale.js';

const saleSchema = z.object({
  product: z.string().trim().min(1),
  date: z.iso.date(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});

const salesSchema = z.array(saleSchema);

type Decoded =
  | { readonly kind: 'decoded'; readonly result: ReturnType<typeof salesSchema.safeParse> }
  | { readonly kind: 'malformed-json' };

export type ParsedSales = { readonly kind: 'sales'; readonly sales: readonly Sale[] } | Failure;

function decode(text: string): Decoded {
  try {
    return { kind: 'decoded', result: salesSchema.safeParse(JSON.parse(text)) };
  } catch {
    return { kind: 'malformed-json' };
  }
}

function describeIssue(issue: z.core.$ZodIssue, path: string): string {
  const [index, field] = issue.path;
  if (index === undefined) {
    return `Expected a JSON array in ${path}`;
  }
  const detail = field === undefined ? 'not an object' : String(field);
  return `Invalid record #${String(index)} in ${path}: ${detail}`;
}

export function parseSales(text: string, path: string): ParsedSales {
  const decoded = decode(text);
  if (decoded.kind === 'malformed-json') {
    return { kind: 'failure', messages: [`Malformed JSON in ${path}`] };
  }
  if (!decoded.result.success) {
    return {
      kind: 'failure',
      messages: decoded.result.error.issues.map((issue) => describeIssue(issue, path)),
    };
  }
  return { kind: 'sales', sales: decoded.result.data };
}
