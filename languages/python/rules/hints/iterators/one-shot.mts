import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const OWNED = /^(.+) \((.+)\)$/u;

function oneShotDescription(subject = ''): string {
  const [, name = subject, owner] = OWNED.exec(subject) ?? [];
  const place = owner === undefined ? '' : ` in \`${owner}\``;
  return `\`${name}\` is a generator or iterator that is read more than once${place}: the first read uses it up, so a later loop, membership test or forwarded call sees nothing`;
}

export const ONE_SHOT_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['iterator-read-twice'],
    describe: oneShotDescription,
    allowed:
      'Materialize it once (`items = list(items)`, `tuple(...)`), or split it with `itertools.tee`; take a `Collection` or `Sequence` and convert at the boundary. In a Django `save` override, write `update_fields = kwargs["update_fields"] = list(update_fields)` before the first test.',
  },
];
