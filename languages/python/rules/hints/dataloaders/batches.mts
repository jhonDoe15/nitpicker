import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

function describe(subject: string): string {
  const [owner = '<loader>', kind = 'unmapped', detail = ''] = subject.split('|');
  if (kind === 'lookup') {
    return `The batch function \`${owner}\` reads \`${detail}\` for every key: a key with no row raises, which fails the whole batch and every caller waiting on it`;
  }
  if (kind === 'empty') {
    return `The batch function \`${owner}\` returns an empty list: a DataLoader needs exactly one entry per key, so callers get nothing (or the batch fails) when no row matched`;
  }
  return `The batch function \`${owner}\` returns ${detail === 'dict' ? 'a dict' : 'rows as they come'} instead of one entry per key in the order of the keys: values reach the wrong callers and a missing row shifts every entry after it`;
}

export const DATALOADER_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['dataloader-batch-result'],
    describe,
    allowed:
      'Build the result by mapping over the keys: `by_id = {row.pk: row for row in rows}` and `return [by_id.get(key) for key in keys]`, with `None` (or an exception object) for a key that has no row, and `[None] * len(keys)` instead of `[]`.',
  },
];
