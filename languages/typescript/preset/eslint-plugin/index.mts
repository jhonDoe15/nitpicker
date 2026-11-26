import type { ESLint, Rule } from 'eslint';
import { isRuleModule } from '../../../../shared/values/readers.mts';
import { replayedByEngine } from './replay/engine-replay.mts';
import { conditionsHold } from './engine/engine-requests.mts';
import { ENGINE_PLUGIN_RULES, PLUGIN_RULE_PREFIX } from './engine/engine-rules.mts';
import { directoryRules } from './rules.generated.mts';

export type NitpickerPlugin = ESLint.Plugin & {
  readonly rules: Readonly<Record<string, Rule.RuleModule>>;
};

function eslintRule([name, rule]: [string, unknown]): [string, Rule.RuleModule] {
  if (!isRuleModule(rule)) {
    throw new TypeError(`The nitpicker rule ${name} is not an ESLint rule module.`);
  }
  const ruleId = `${PLUGIN_RULE_PREFIX}${name}`;
  return [
    name,
    ENGINE_PLUGIN_RULES.has(name)
      ? replayedByEngine(ruleId, rule, (conditions, filename) =>
          conditionsHold(ruleId, conditions, filename),
        )
      : rule,
  ];
}

export const nitpickerRules: NitpickerPlugin = {
  meta: {
    name: 'nitpicker',
    version: '0.1.0',
  },
  rules: Object.fromEntries(Object.entries(directoryRules).map(eslintRule)),
};
