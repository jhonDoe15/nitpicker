import { ruleEntry } from '../../typed/entry-views.mts';
import type { RuleEntry } from '../../typed/entry-views.mts';
import { JVM_ANALYZERS, JVM_BUILDS } from '../../catalog-rules.mts';
import {
  HIDDEN_INHERITED_FIELD_ALLOWED,
  HIDDEN_INHERITED_FIELD_EXCEPTION_RULE,
  HIDDEN_INHERITED_FIELD_RULE,
} from '../../../adapters/review-rules/hidden-fields/hidden-inherited-field.mts';

export function hiddenInheritedFieldEntry(): RuleEntry {
  return ruleEntry({
    page: 'java-nitpicker',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    tool: 'pmd',
    rule: HIDDEN_INHERITED_FIELD_RULE,
    summary:
      'A local variable, parameter, lambda or pattern variable, or field with the name of a non-static, non-private field that the class inherits from a project superclass and can see, when the class also uses the inherited field by its short name, through `this.` or through `super.`. Constructor and setter (`setX`, `withX`) parameters, parameters never read, passed to `super.sameMethod(...)` or assigned to the field (`this.x = requireNonNull(x)`), static methods and superclasses from libraries are left out.',
    why: 'Inside the class the short name now means two things: the new variable in one method and the inherited field in the next, so a reader who knows the superclass reads the wrong one. Nitpicker reads the sources of every module for it, because the superclass is usually in another file, and prints it as a PMD rule.',
    allowed: HIDDEN_INHERITED_FIELD_ALLOWED,
    exception: { key: 'exceptions', rule: HIDDEN_INHERITED_FIELD_EXCEPTION_RULE },
    docs: [
      {
        label: 'Java preset guide',
        path: 'docs/java-preset.md',
        anchor: 'inherited-fields-hidden-by-a-local-name',
      },
    ],
  });
}
