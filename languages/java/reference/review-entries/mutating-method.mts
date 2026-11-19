import { counterpartsOf, ruleEntry } from '../typed/entry-views.mts';
import type { RuleEntry } from '../typed/entry-views.mts';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mts';
import {
  MUTATING_METHOD_ALLOWED,
  MUTATING_METHOD_EXCEPTION_RULE,
  MUTATING_METHOD_RULE,
} from '../../adapters/review-rules/mutating-methods/mutating-methods.mts';

export function mutatingMethodEntry(): RuleEntry {
  return ruleEntry({
    page: 'java-nitpicker',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    tool: 'pmd',
    rule: MUTATING_METHOD_RULE,
    summary:
      'In a class of a `domain` package, a mutating call (`add`, `remove`, `put`, `clear`, `sort`, `set` and the other mutators of `java.util` collections, Kotlin `MutableList` and friends, or a setter of `Date`, `Calendar` or `BitSet`) on a parameter the method did not create.',
    why: 'Domain code builds new values instead of changing the ones it is given, so a caller never finds its list, map or date changed by a call. Nitpicker reads the sources of every module for it and prints it as a PMD rule. A collection created and filled in the same function is allowed.',
    allowed: MUTATING_METHOD_ALLOWED,
    exception: { key: 'exceptions', rule: MUTATING_METHOD_EXCEPTION_RULE },
    docs: [
      {
        label: 'Java preset guide',
        path: 'docs/java-preset.md',
        anchor: 'mutating-methods-in-domain-code',
      },
      ...counterpartsOf(MUTATING_METHOD_EXCEPTION_RULE),
    ],
  });
}
