import type { Rule } from 'eslint';
import { fieldOf, isRuleModule } from '../../../../../shared/values/readers.mts';

export { withHint, withoutFixes, withReportFilter, type ReportFilter } from '../rule-hints.mts';

export function ruleNamed(rules: unknown, name: string): Rule.RuleModule {
  const rule = fieldOf(rules, name);
  if (!isRuleModule(rule)) {
    throw new Error(`No rule named ${name}`);
  }
  return rule;
}
