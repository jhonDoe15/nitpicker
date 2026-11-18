import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

export const VALUE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['unchecked-response-json'],
    describe: (subject) =>
      `\`${subject}.json()\` is read before \`${subject}\` is checked, so an error page from a proxy or gateway fails as an opaque \`ValueError\` and the real status is lost`,
    allowed:
      'Call `raise_for_status()` (or test `status_code` or `ok`) before `.json()`, or read `.text` and parse it inside `try`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['nan-only-guard'],
    describe: (subject) =>
      `\`math.isnan(${subject})\` is the only check on a parsed float, but \`inf\` and \`-inf\` pass it`,
    allowed:
      'Check `math.isfinite(value)`, which rejects NaN and both infinities; or add a range check of the value. An exception fits only when infinity is a valid value here.',
  },
  {
    tool: RULES_TOOL,
    rules: ['index-bound-off-by-one'],
    describe: (subject) =>
      `\`${subject}\` lets an index equal to the length through before the read, so the read raises \`IndexError\``,
    allowed:
      'Reject with `index >= len(items)` (or accept with `index < len(items)`) before the read; `>` and `<=` are right only for an insertion position.',
  },
];
