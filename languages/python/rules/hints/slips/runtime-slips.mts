import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

export const RUNTIME_SLIP_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['empty-sequence-access'],
    describe: (subject) =>
      `\`${subject}\` reads the first, last, smallest or largest item of a sequence that can be empty here, and nothing in the code shows it has an item: an empty one raises an error and fails the whole request`,
    allowed:
      'Handle the empty case: give `min`/`max` a `default=` (`max(items, default=None)`), check first (`if items:` or `if len(items) > 0:`, or return early when it is empty), take the item with `next(iter(items), None)` and for a queryset `qs.first()` or `qs.last()`, or catch `ValueError` or `IndexError` around the call.',
  },
  {
    tool: RULES_TOOL,
    rules: ['timedelta-seconds-as-total'],
    describe: (subject) =>
      `\`${subject}\` is only the seconds or microseconds component of a time difference (\`seconds\` runs from 0 to 86399), and the days are in \`.days\`, so an age or lifetime past one day reads as a small number`,
    allowed:
      'Use the full duration: `(now - start).total_seconds()`. When the parts are meant, write them out: `delta.days * 86400 + delta.seconds`.',
  },
];
