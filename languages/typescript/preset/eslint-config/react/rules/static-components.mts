import type { Rule } from 'eslint';
import { withReportFilter } from '../../typed/rule-views.mts';

const callCreations = new Set(['CallExpression', 'NewExpression']);

export function createdByCallOnly(rule: Rule.RuleModule): Rule.RuleModule {
  return withReportFilter(rule, () => {
    const pending = new Map<string, Rule.ReportDescriptor>();
    return (descriptor) => {
      if (!('messageId' in descriptor) || descriptor.messageId !== 'createdHere') {
        pending.set('use', descriptor);
        return undefined;
      }
      const use = pending.get('use');
      pending.delete('use');
      return use !== undefined && 'node' in descriptor && callCreations.has(descriptor.node.type)
        ? use
        : undefined;
    };
  });
}
