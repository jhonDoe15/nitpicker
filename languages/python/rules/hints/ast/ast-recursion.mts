import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const MUTUAL = ' <-> ';

function parts(subject = ''): [string, string | undefined] {
  const [name = '', other] = subject.split(MUTUAL);
  return [name, other];
}

export const RECURSION_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['self-recursion'],
    describe: (subject: string): string => {
      const [name, other] = parts(subject);
      return other === undefined
        ? `\`${name}\` calls itself, and a walk over input of unknown depth overflows the stack with RecursionError`
        : `\`${name}\` and \`${other}\` call each other, and a walk over input of unknown depth overflows the stack with RecursionError`;
    },
    allowed: (subject = ''): string =>
      parts(subject)[1] === undefined
        ? "Retry or poll: loop with `for attempt in range(attempts)`. Tree walk (directories, AST, JSON): loop over a worklist, extending it with each node's children (`for node in pending: pending.extend(children)`). Flat data: a comprehension, `map` or `itertools.chain.from_iterable`. An exception fits only when the recursion is bounded and deliberate."
        : 'Replace the cycle with a `for` loop over a worklist, or merge the functions into one that loops. An exception fits only when the recursion is bounded and deliberate.',
  },
];
