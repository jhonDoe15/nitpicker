import type { Rule } from 'eslint';
import formatjs from 'eslint-plugin-formatjs';
import {
  type ReportFilter,
  withHint,
  withoutFixes,
  withReportFilter,
} from '../typed/rule-views.mts';
import { dropParseErrors, reportOncePerNode } from './i18n-filters.mjs';
import { i18nRules } from './i18n-rules.mjs';

const formatjsRules: Readonly<Record<string, Rule.RuleModule>> = formatjs.rules ?? {};

function upstreamRule(name: string): Rule.RuleModule {
  const rule = formatjsRules[name];
  if (rule === undefined) {
    throw new Error(`eslint-plugin-formatjs has no rule ${name}`);
  }
  return rule;
}

function withMessages(
  rule: Rule.RuleModule,
  messages: Readonly<Record<string, string>> = {},
): Rule.RuleModule {
  return { ...rule, meta: { ...rule.meta, messages: { ...rule.meta?.messages, ...messages } } };
}

type I18nRuleEntry = {
  readonly hint: string;
  readonly messages?: Readonly<Record<string, string>>;
  readonly filters?: readonly ReportFilter[];
  readonly ownsParseErrors?: unknown;
};

function i18nRule(name: string, { hint, messages, filters = [], ownsParseErrors }: I18nRuleEntry) {
  const filtered = [
    ...(ownsParseErrors === true ? [] : [dropParseErrors]),
    ...filters,
    reportOncePerNode,
  ].reduce(withReportFilter, withMessages(upstreamRule(name), messages));
  return withoutFixes(withHint(filtered, hint));
}

export const i18nPlugin = {
  rules: Object.fromEntries(
    Object.entries(i18nRules).map(([name, entry]) => [name, i18nRule(name, entry)]),
  ),
};
