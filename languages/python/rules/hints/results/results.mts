import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const TRUTH = '|truth';

function discardedDescribe(subject: string): string {
  if (subject.endsWith(TRUTH)) {
    return `\`${subject.slice(0, -TRUTH.length)}\` returns a tuple, which is always true: testing it never tells whether a row was deleted or created`;
  }
  return `\`${subject}\` returns a new value and leaves the receiver unchanged, so as a statement it does nothing and the code goes on with the old value`;
}

function unreturnedDescribe(subject: string): string {
  const [call = '', type = ''] = subject.split('|');
  return `\`${call}\` returns a \`${type}\`, the type this function returns, but the call stands as a statement: its result is dropped and the function goes on or ends without it`;
}

export const RESULT_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['discarded-new-value'],
    describe: discardedDescribe,
    allowed:
      'Assign or return the result: `query = query.filter(...)`, `expires = expires.replace(microsecond=0)`. To test `delete()`, `get_or_create()` or `update_or_create()`, unpack the tuple (`count, _ = query.delete()`, `row, created = ...`) and test the part you mean.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unreturned-result'],
    describe: unreturnedDescribe,
    allowed:
      "Return the call (`return helper(...)`), or assign the result and return it later. A call made only for its effect should not hand back the function's own result type.",
  },
];
