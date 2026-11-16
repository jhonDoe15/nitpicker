import { RULES_TOOL } from '../tool.mts';
import { parseEffect } from './subject.mts';
import type { RuleHint } from '../hint-types.mts';

const ADVICE =
  'Append to one list in the loop (`acc.append(item)`, `acc.extend(items)`), build it with a comprehension or `itertools.chain.from_iterable`, or fill one dict or `collections.defaultdict` in the loop (`acc[key] = value`, `acc.update(pairs)`). The unpacked form `[*acc, item]` that ruff suggests for `acc + [item]` is a copy too.';

function describe(subject: string): string {
  const { path, fields } = parseEffect(subject);
  const [form = '', where] = fields;
  const [target = ''] = path;
  const step = where === 'reduce' ? 'every step of the `reduce`' : 'every pass of the loop';
  return `\`${target}\` is replaced by a copy of itself (\`${form}\`) on ${step}, so the work grows with the square of the list`;
}

export const ACCUMULATOR_HINTS: readonly RuleHint[] = [
  { tool: RULES_TOOL, rules: ['accumulator-copy'], describe, allowed: ADVICE },
];
