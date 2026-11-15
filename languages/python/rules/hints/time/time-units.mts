import { hintText, unitAllowedForm, unitDescription } from '../typed/message-views.mts';
import { RULES_TOOL } from '../tool.mts';
import type { HintData, RuleHint } from '../hint-types.mts';

const KEEP =
  'Keep epoch times in a Python `int` or a `datetime`, or use a 64-bit type (`numpy.int64`).';

function values(data: HintData) {
  return { keep: KEEP, ...data };
}

export const TIME_UNIT_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['time-unit-mismatch'],
    describe: (_subject, _libraries, data) => unitDescription(hintText(data, 'kind'), values(data)),
    referenceData: {
      kind: 'mixed',
      left: 'payload["exp"]',
      leftUnit: 'seconds',
      right: 'time.time() * 1000',
      rightUnit: 'milliseconds',
      factor: 1000,
      example: '(time.time() * 1000) / 1000',
    },
    allowedFor: (data) => unitAllowedForm(hintText(data, 'kind'), values(data)),
  },
];
