import { ruleEntry } from '../../../../shared/reference/entry.mjs';
import { counterpartsOf } from '../../../../shared/reference/counterparts.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mjs';
import {
  NULL_FALL_THROUGH_ALLOWED,
  NULL_FALL_THROUGH_EXCEPTION_RULE,
  NULL_FALL_THROUGH_RULE,
} from '../../adapters/review-rules/null-fall-through/null-fall-through.mjs';

export function nullFallThroughEntry() {
  return ruleEntry({
    page: 'java-nitpicker',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    tool: 'pmd',
    rule: NULL_FALL_THROUGH_RULE,
    summary:
      'An `if (x == null)` with no `else` whose branch does something (a call, an append, a log, an assignment to another variable) and does not leave, followed in the same block by a dereference of `x`, unboxing, iteration, `x!!` or the same call with `x`.',
    why: 'On the null path the later use throws a `NullPointerException`, or the value is handled twice (the Defects4J jackson-databind `serializeAsColumn` bug writes `null` and then goes on). Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
    allowed: NULL_FALL_THROUGH_ALLOWED,
    exception: { key: 'exceptions', rule: NULL_FALL_THROUGH_EXCEPTION_RULE },
    docs: [
      {
        label: 'Java preset guide',
        path: 'docs/java-preset.md',
        anchor: 'null-branches-that-fall-through',
      },
      ...counterpartsOf(NULL_FALL_THROUGH_EXCEPTION_RULE),
    ],
  });
}
