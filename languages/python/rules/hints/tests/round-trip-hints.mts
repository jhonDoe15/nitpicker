import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

export const ROUND_TRIP_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['untested-round-trip'],
    describe: (subject) =>
      `${subject} turn values into each other, and no test runs one on the output of the other, so a field that one of them drops or garbles goes unnoticed`,
    allowed:
      'Add a test that calls both on the same value: `assert Order.from_dict(order.to_dict()) == order`, with values that need escaping or mapping (quotes, newlines, non-ASCII, `None` fields).',
  },
];
