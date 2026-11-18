import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

export const TEXT_SPLIT_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['pair-split-drops-rest'],
    describe: (subject) =>
      `\`${subject}\` splits on every separator and keeps the second part, which silently drops everything ` +
      `after the next separator (a URL, a message with several colons, base64 padding)`,
    allowed:
      'Split once: `key, _, value = text.partition(":")` or `text.split(":", 1)`; or reject any other part ' +
      'count (`key, value = text.split(":")` raises on a third part).',
  },
  {
    tool: RULES_TOOL,
    rules: ['delimited-lookup-key'],
    describe: (subject) =>
      `The key \`${subject}\` joins two strings with a delimiter, so \`"a-b"\` with \`"c"\` and \`"a"\` ` +
      `with \`"b-c"\` give the same key and one entry overwrites or finds the other`,
    allowed:
      'Key by a tuple (`(tenant, name)`) or a frozen dataclass or `NamedTuple`, or escape the parts first.',
  },
];
