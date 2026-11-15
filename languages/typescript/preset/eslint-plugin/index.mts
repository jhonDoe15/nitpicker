import type { ESLint, Rule } from 'eslint';
import { directoryRules } from './rules.generated.mts';

export type NitpickerPlugin = ESLint.Plugin & {
  readonly rules: Readonly<Record<string, Rule.RuleModule>>;
};

function isRuleModule(value: unknown): value is Rule.RuleModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'create' in value &&
    typeof value.create === 'function'
  );
}

function eslintRule([name, rule]: [string, unknown]): [string, Rule.RuleModule] {
  if (!isRuleModule(rule)) {
    throw new TypeError(`The nitpicker rule ${name} is not an ESLint rule module.`);
  }
  return [name, rule];
}

export const nitpickerRules: NitpickerPlugin = {
  meta: {
    name: 'nitpicker',
    version: '0.1.0',
  },
  rules: Object.fromEntries(Object.entries(directoryRules).map(eslintRule)),
};
