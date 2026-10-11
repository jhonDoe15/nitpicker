import { isJavascriptPolicy } from './javascript-preset.mjs';

export const DROPPED_RULES = [
  '@typescript-eslint/consistent-type-definitions',
  '@typescript-eslint/consistent-type-imports',
];

export const JSDOC_RULE_OPTIONS = {
  'nitpicker/no-comments': { jsdocTypes: true },
  'nitpicker/no-unknown-in-domain': { jsdoc: true },
  'nitpicker/no-handwritten-boundary-guard': { jsdoc: true },
  'nitpicker/report-module-load-effects': { commonJsExports: true },
};

const TYPESCRIPT_SYNTAX_SELECTOR = /\bTS[A-Z]\w*/;
const ACTIVE_SEVERITIES = ['error', 'warn', 1, 2];

function selectorText(restriction) {
  return typeof restriction === 'string' ? restriction : restriction.selector;
}

function withoutTypeScriptSyntax([severity, ...restrictions]) {
  return [
    severity,
    ...restrictions.filter(
      (restriction) => !TYPESCRIPT_SYNTAX_SELECTOR.test(selectorText(restriction)),
    ),
  ];
}

function withOptions(setting, options) {
  return ACTIVE_SEVERITIES.includes(setting) ? [setting, options] : setting;
}

function dialectSetting(name, setting) {
  if (name === 'no-restricted-syntax' && Array.isArray(setting)) {
    return withoutTypeScriptSyntax(setting);
  }
  return Object.hasOwn(JSDOC_RULE_OPTIONS, name)
    ? withOptions(setting, JSDOC_RULE_OPTIONS[name])
    : setting;
}

function dialectRules(rules) {
  return Object.fromEntries(
    Object.entries(rules)
      .filter(([name]) => !DROPPED_RULES.includes(name))
      .map(([name, setting]) => [name, dialectSetting(name, setting)]),
  );
}

function dialectEntry(entry) {
  return entry.rules === undefined ? entry : { ...entry, rules: dialectRules(entry.rules) };
}

export function applyJavascriptDialect(entries, policy) {
  return isJavascriptPolicy(policy) ? entries.map(dialectEntry) : entries;
}
