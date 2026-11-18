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
];
