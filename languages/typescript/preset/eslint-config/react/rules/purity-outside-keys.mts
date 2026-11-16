import { inKeyAttribute } from '../../../eslint-plugin/rules/react/jsx.mts';
import type { Rule } from 'eslint';
import { withReportFilter } from '../../typed/rule-views.mts';
import { isNode } from '../../../eslint-plugin/rules/typed/node-views.mts';

export function outsideKeyAttributes(rule: Rule.RuleModule): Rule.RuleModule {
  return withReportFilter(
    rule,
    () => (descriptor) =>
      'node' in descriptor && isNode(descriptor.node) && inKeyAttribute(descriptor.node)
        ? undefined
        : descriptor,
  );
}
