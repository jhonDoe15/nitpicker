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
];
