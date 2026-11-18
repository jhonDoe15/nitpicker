import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const SWAPPED = 'swap ';

function simplerForm(subject = ''): string {
  return subject.startsWith(SWAPPED)
    ? `Write this boolean logic in its simpler exact form: \`${subject.slice(SWAPPED.length)}\`, with the two branches swapped`
    : `Write this boolean logic in its simpler exact form: \`${subject}\``;
}

export const SIMPLER_LOGIC_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['simpler-boolean-logic'],
    describe: simplerForm,
    allowed:
      'Drop the `not` and swap what it chose between (`if ready:` first, `b if ready else a`), or negate once: `not (a or b)` for `not a and not b`.',
  },
  {
    tool: 'ruff',
    rules: ['SIM102'],
    allowed:
      'Merge them into one `if a and b:`; an operand that holds `or` goes in parentheses. Nesting stays when the outer `if` has an `else` or other statements.',
  },
  {
    tool: 'ruff',
    rules: ['SIM210'],
    allowed:
      'Write the condition itself when it is already a `bool` (`return a < b`), else `bool(value)`.',
  },
];
