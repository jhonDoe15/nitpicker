import {
  unitAllowedForm,
  unitDescription,
} from '../../../../../shared/naming/time-units/unit-messages.mjs';
import { RULES_TOOL } from '../tool.mjs';

const KEEP =
  'Keep epoch times in a Python `int` or a `datetime`, or use a 64-bit type (`numpy.int64`).';

function values(data) {
  return { keep: KEEP, ...data };
}

export const TIME_UNIT_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['time-unit-mismatch'],
    describe: (_subject, _libraries, data) => unitDescription(data.kind, values(data)),
    referenceData: {
      kind: 'mixed',
      left: 'payload["exp"]',
      leftUnit: 'seconds',
      right: 'time.time() * 1000',
      rightUnit: 'milliseconds',
      factor: 1000,
      example: '(time.time() * 1000) / 1000',
    },
    allowedFor: (data) => unitAllowedForm(data.kind, values(data)),
  },
];
