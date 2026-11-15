import { inKeyAttribute } from '../../../eslint-plugin/rules/react/jsx.mjs';
import type { Rule } from 'eslint';
import { withReportFilter } from '../../typed/rule-views.mts';

export function outsideKeyAttributes(rule: Rule.RuleModule): Rule.RuleModule {
  return withReportFilter(
    rule,
    () => (descriptor) =>
      'node' in descriptor && inKeyAttribute(descriptor.node) ? undefined : descriptor,
  );
}
