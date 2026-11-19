import { ruleEntry } from '../typed/entry-views.mts';
import type { RuleEntry } from '../typed/entry-views.mts';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mts';
import {
  NULLABLE_RETURN_ALLOWED,
  NULLABLE_RETURN_EXCEPTION_RULE,
  NULLABLE_RETURN_RULE,
} from '../../adapters/review-rules/nullable-returns/nullable-returns.mts';

export function nullableReturnEntry(): RuleEntry {
  return ruleEntry({
    page: 'java-nitpicker',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    tool: 'pmd',
    rule: NULLABLE_RETURN_RULE,
    summary:
      'The result of a project method that can return `null` (a `return null;` that other callers check, a local that stays `null` on some path, a Javadoc `@return` that says so, or a result most other callers check) dereferenced, unboxed, iterated, switched on or passed to a project method that dereferences it, with no null check before the use.',
    why: 'NullAway needs an `@Nullable` annotation to know the method can return `null` and SpotBugs only follows nulls inside one method, so the caller throws a `NullPointerException` on the path where the method returns `null` (three Defects4J bugs have this shape). Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
    allowed: NULLABLE_RETURN_ALLOWED,
    exception: { key: 'exceptions', rule: NULLABLE_RETURN_EXCEPTION_RULE },
    docs: [
      {
        label: 'Java preset guide',
        path: 'docs/java-preset.md',
        anchor: 'results-of-methods-that-can-return-null',
      },
    ],
  });
}
