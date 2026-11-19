import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

export const FAILURE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['reset-skipped-on-failure'],
    describe: (subject) =>
      `\`${subject}\`: the undo step is not in a \`finally\`, so when the code between them raises it never runs and the state stays set for every later call`,
    allowed:
      'Put the undo step in `finally`: `token = var.set(value)`, then `try: yield` (or the work) and `finally: var.reset(token)`. In a context manager that holds several undo steps, register each one with `contextlib.ExitStack().callback(...)`, or write a class with `__exit__`.',
  },
];
