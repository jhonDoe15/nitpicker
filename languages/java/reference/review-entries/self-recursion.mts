import { counterpartsOf, ruleEntry } from '../typed/entry-views.mts';
import type { RuleEntry } from '../typed/entry-views.mts';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mts';
import {
  SELF_RECURSION_ALLOWED,
  SELF_RECURSION_EXCEPTION_RULE,
  SELF_RECURSION_RULE,
} from '../../adapters/review-rules/self-recursion/self-recursion.mts';

export function selfRecursionEntry(): RuleEntry {
  return ruleEntry({
    page: 'java-nitpicker',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    tool: 'pmd',
    rule: SELF_RECURSION_RULE,
    summary:
      'A method or function that calls itself, or two or more functions of one file that call each other, where the call has the same name and number of arguments. Overloads that delegate to each other, a call on another receiver and a call inside a scheduled callback are not reported.',
    why: 'Recursion over input of unknown depth overflows the stack. Error Prone `InfiniteRecursion` reports only the case that never stops; a retry, a tree walk or a flattening that recurses is a loop over attempt numbers or a worklist.',
    allowed: SELF_RECURSION_ALLOWED,
    exception: { key: 'exceptions', rule: SELF_RECURSION_EXCEPTION_RULE },
    docs: [
      {
        label: 'Java preset guide',
        path: 'docs/java-preset/self-recursion.md',
      },
      ...counterpartsOf(SELF_RECURSION_EXCEPTION_RULE),
    ],
  });
}
