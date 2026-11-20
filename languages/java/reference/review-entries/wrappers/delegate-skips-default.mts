import { ruleEntry } from '../../typed/entry-views.mts';
import type { RuleEntry } from '../../typed/entry-views.mts';
import { JVM_ANALYZERS, JVM_BUILDS } from '../../catalog-rules.mts';
import {
  DELEGATE_SKIPS_DEFAULT_ALLOWED,
  DELEGATE_SKIPS_DEFAULT_EXCEPTION_RULE,
  DELEGATE_SKIPS_DEFAULT_RULE,
} from '../../../adapters/review-rules/delegate-defaults/delegate-skips-default.mts';

export function delegateSkipsDefaultEntry(): RuleEntry {
  return ruleEntry({
    page: 'java-nitpicker',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    tool: 'pmd',
    rule: DELEGATE_SKIPS_DEFAULT_RULE,
    summary:
      'A class that implements a project interface, holds a delegate field of that interface and forwards most of its overrides to it, but declares no `default` method that returns a constant, does nothing or throws (a metrics getter, a capability flag, a callback), nor does a project superclass or subclass, so calls to it never reach the delegate. At most three such defaults.',
    why: 'The call runs the interface default on the wrapper, so the wrapped object behaviour (metrics, a flag, a callback) is lost, usually after the interface gained a default method. Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
    allowed: DELEGATE_SKIPS_DEFAULT_ALLOWED,
    exception: { key: 'exceptions', rule: DELEGATE_SKIPS_DEFAULT_EXCEPTION_RULE },
    docs: [
      {
        label: 'Java preset guide',
        path: 'docs/java-preset.md',
        anchor: 'wrappers-that-skip-a-default-method',
      },
    ],
  });
}
