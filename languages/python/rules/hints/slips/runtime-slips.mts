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
];
