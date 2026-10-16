import formatjs from 'eslint-plugin-formatjs';
import { withHint, withoutFixes, withReportFilter } from '../rule-hints.mjs';
import { dropParseErrors, reportOncePerNode } from './i18n-filters.mjs';
import { i18nRules } from './i18n-rules.mjs';

function withMessages(rule, messages = {}) {
  return { ...rule, meta: { ...rule.meta, messages: { ...rule.meta.messages, ...messages } } };
}

function i18nRule(name, { hint, messages, filters = [], ownsParseErrors = false }) {
  const filtered = [
    ...(ownsParseErrors ? [] : [dropParseErrors]),
    ...filters,
    reportOncePerNode,
  ].reduce(withReportFilter, withMessages(formatjs.rules[name], messages));
  return withoutFixes(withHint(filtered, hint));
}

export const i18nPlugin = {
  rules: Object.fromEntries(
    Object.entries(i18nRules).map(([name, entry]) => [name, i18nRule(name, entry)]),
  ),
};
