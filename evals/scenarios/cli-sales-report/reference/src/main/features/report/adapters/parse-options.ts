import { z } from 'zod';
import { isOrdered } from '../domain/date-range.js';
import { parseArguments } from '../domain/parse-arguments.js';
import type { Format, Failure } from '../domain/sale.js';

function dateSchema(flag: string) {
  return z.iso.date({ error: (issue) => `Invalid date for ${flag}: ${String(issue.input)}` });
}

const optionsSchema = z
  .object({
    input: z.string({ error: 'Missing required option: --input' }),
    from: dateSchema('--from').optional(),
    to: dateSchema('--to').optional(),
    format: z
      .enum(['table', 'csv'], { error: (issue) => `Invalid format: ${String(issue.input)}` })
      .default('table'),
  })
  .refine(isOrdered, { error: '--from must not be after --to' });

type Options = {
  readonly input: string;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly format: Format;
};

export type ParsedOptions = { readonly kind: 'options'; readonly options: Options } | Failure;

export function parseOptions(argv: readonly string[]): ParsedOptions {
  const parsed = parseArguments(argv);
  if (parsed.kind === 'failure') {
    return parsed;
  }
  const validated = optionsSchema.safeParse(parsed.options);
  if (!validated.success) {
    return { kind: 'failure', messages: validated.error.issues.map((issue) => issue.message) };
  }
  return { kind: 'options', options: validated.data };
}
