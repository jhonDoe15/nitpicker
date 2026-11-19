import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const FORWARD = /^(\S+): (.+?) > (.+)$/u;
const SERIALIZE = /^(\S+): (.+)$/u;

function notForwardedDescription(subject = ''): string {
  const [, name = '', from = '', to] = FORWARD.exec(subject) ?? [];
  if (to?.startsWith('super()') === true) {
    return `\`${from}\` takes \`${name}\` but calls \`${to}\` without it, so the caller's \`${name}\` is silently ignored by the base method`;
  }
  if (to !== undefined) {
    return `\`${from}\` takes \`${name}\` but calls \`${to}\` without it, although \`${to}\` has a \`${name}\` parameter, so the caller's setting is dropped`;
  }
  const [, field = subject, owner = ''] = SERIALIZE.exec(subject) ?? [];
  return `\`${owner}\` leaves \`${field}\` out of the arguments it returns, so the object rebuilt from them runs without it`;
}

export const FORWARDED_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['parameter-not-forwarded'],
    describe: notForwardedDescription,
    allowed:
      'Pass the parameter on (`super().parse_result(result, partial=partial)`, a `"region_name": self.region_name` entry in `serialize()`), forward everything with `*args, **kwargs`, or drop the parameter from the signature when the override deliberately narrows the base method.',
  },
];
