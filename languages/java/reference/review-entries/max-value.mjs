import { ruleEntry } from '../../../../shared/reference/entry.mjs';
import { counterpartsOf } from '../../../../shared/reference/counterparts.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mjs';
import {
  MAX_VALUE_ALLOWED,
  MAX_VALUE_EXCEPTION_RULE,
  MAX_VALUE_RULE,
} from '../../adapters/review-rules/max-value-sums/max-value-sums.mjs';

export function maxValueEntry() {
  return ruleEntry({
    page: 'java-nitpicker',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    tool: 'pmd',
    rule: MAX_VALUE_RULE,
    summary:
      'An integer `+`, `*` or `+=` with an operand that can hold `Integer.MAX_VALUE` or `Long.MAX_VALUE` (a constant, field or local initialised to it, a parameter a call passes it or defaults to it), whose result is an index, length, bound, `Math.min` argument or compared.',
    why: 'A "no limit" value overflows as soon as it is added to something, and the negative result goes on as an index or bound. Nitpicker reads the sources of every module for it and prints it as a PMD rule, like the other cross-file rules.',
    allowed: MAX_VALUE_ALLOWED,
    exception: { key: 'exceptions', rule: MAX_VALUE_EXCEPTION_RULE },
    docs: [
      {
        label: 'Java preset guide',
        path: 'docs/java-preset.md',
        anchor: 'sums-that-overflow-a-maximum-value',
      },
      ...counterpartsOf(MAX_VALUE_EXCEPTION_RULE),
    ],
  });
}
