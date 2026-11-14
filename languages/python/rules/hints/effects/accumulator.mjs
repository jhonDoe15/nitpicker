import { RULES_TOOL } from '../tool.mjs';
import { parseEffect } from './subject.mjs';

const ADVICE =
  'Append to one list in the loop (`acc.append(item)`, `acc.extend(items)`), build it with a comprehension or `itertools.chain.from_iterable`, or fill one dict or `collections.defaultdict` in the loop (`acc[key] = value`, `acc.update(pairs)`). The unpacked form `[*acc, item]` that ruff suggests for `acc + [item]` is a copy too.';

function describe(subject) {
  const { path, fields } = parseEffect(subject);
  const [form, where] = fields;
  const step = where === 'reduce' ? 'every step of the `reduce`' : 'every pass of the loop';
  return `\`${path[0]}\` is replaced by a copy of itself (\`${form}\`) on ${step}, so the work grows with the square of the list`;
}

export const ACCUMULATOR_HINTS = [
  { tool: RULES_TOOL, rules: ['accumulator-copy'], describe, allowed: ADVICE },
];
