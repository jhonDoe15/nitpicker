import { counterpartsOf, ruleEntry } from '../typed/entry-views.mts';
import type { RuleEntry } from '../typed/entry-views.mts';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mts';
import {
  FIXED_DELAY_ALLOWED,
  FIXED_DELAY_EXCEPTION_RULE,
  FIXED_DELAY_RULE,
} from '../../adapters/review-rules/fixed-delays/fixed-delays.mts';

export function fixedDelayEntry(): RuleEntry {
  return ruleEntry({
    page: 'java-nitpicker',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    tool: 'pmd',
    rule: FIXED_DELAY_RULE,
    summary:
      'In production code, `Thread.sleep`, `TimeUnit.X.sleep`, Kotlin `delay` or a `schedule` call that waits a `static final` or top-level `const` of 500 ms or more, inside a public method, constructor or function with no parameter that can carry the delay.',
    why: 'A test of that code has to wait the full delay out or fake the clock. Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
    allowed: FIXED_DELAY_ALLOWED,
    exception: { key: 'exceptions', rule: FIXED_DELAY_EXCEPTION_RULE },
    docs: [
      {
        label: 'Java preset guide',
        path: 'docs/java-preset.md',
        anchor: 'delays-that-tests-cannot-override',
      },
      ...counterpartsOf(FIXED_DELAY_EXCEPTION_RULE),
    ],
  });
}
