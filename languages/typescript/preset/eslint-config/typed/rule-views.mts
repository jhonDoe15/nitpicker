import type { Rule } from 'eslint';
import { fieldOf } from '../../../../../shared/values/readers.mts';

export { withHint, withoutFixes, withReportFilter, type ReportFilter } from '../rule-hints.mts';

function isRuleModule(value: unknown): value is Rule.RuleModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'create' in value &&
    typeof value.create === 'function'
  );
}

export function ruleNamed(rules: unknown, name: string): Rule.RuleModule {
  const rule = fieldOf(rules, name);
  if (!isRuleModule(rule)) {
    throw new Error(`No rule named ${name}`);
  }
  return rule;
}
