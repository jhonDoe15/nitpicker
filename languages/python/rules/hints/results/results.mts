import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const TRUTH = '|truth';

function discardedDescribe(subject: string): string {
  if (subject.endsWith(TRUTH)) {
    return `\`${subject.slice(0, -TRUTH.length)}\` returns a tuple, which is always true: testing it never tells whether a row was deleted or created`;
  }
  return `\`${subject}\` returns a new value and leaves the receiver unchanged, so as a statement it does nothing and the code goes on with the old value`;
}

export const RESULT_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['discarded-new-value'],
    describe: discardedDescribe,
    allowed:
      'Assign or return the result: `query = query.filter(...)`, `expires = expires.replace(microsecond=0)`. To test `delete()`, `get_or_create()` or `update_or_create()`, unpack the tuple (`count, _ = query.delete()`, `row, created = ...`) and test the part you mean.',
  },
];
