import type { Rule } from 'eslint';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import {
  withHint as untypedWithHint,
  withReportFilter as untypedWithReportFilter,
  withoutFixes as untypedWithoutFixes,
} from '../rule-hints.mjs';

export type ReportFilter = (
  context: Rule.RuleContext,
) => (descriptor: Rule.ReportDescriptor) => Rule.ReportDescriptor | undefined;

export const withReportFilter: (rule: Rule.RuleModule, filterFor: ReportFilter) => Rule.RuleModule =
  untypedWithReportFilter;

export const withHint: (rule: Rule.RuleModule, hint: string) => Rule.RuleModule = untypedWithHint;

export const withoutFixes: (rule: Rule.RuleModule) => Rule.RuleModule = untypedWithoutFixes;

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
