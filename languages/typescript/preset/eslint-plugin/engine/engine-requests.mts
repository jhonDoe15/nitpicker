import {
  ENGINE_PLUGIN_RULES,
  type FactProject,
  type FileFacts,
  PLUGIN_RULE_PREFIX,
} from './engine-rules.mts';

type Asked = readonly (readonly [string, string])[] | undefined;

function pluginRuleName(ruleId: string): string | undefined {
  const name = ruleId.startsWith(PLUGIN_RULE_PREFIX)
    ? ruleId.slice(PLUGIN_RULE_PREFIX.length)
    : undefined;
  return name !== undefined && ENGINE_PLUGIN_RULES.has(name) ? name : undefined;
}

export function engineRuleName(ruleId: string): string {
  return pluginRuleName(ruleId) ?? ruleId;
}

function optionsOf(setting: unknown): readonly unknown[] {
  return Array.isArray(setting) ? setting.slice(1) : [];
}

function factsOf(ruleId: string): FileFacts | undefined {
  return ENGINE_PLUGIN_RULES.get(pluginRuleName(ruleId) ?? '')?.facts;
}

export function runsOnEngine([ruleId, setting]: readonly [string, unknown]): boolean {
  return (
    pluginRuleName(ruleId) !== undefined &&
    (optionsOf(setting).length === 0 || factsOf(ruleId) !== undefined)
  );
}

type SettingsRequest = {
  readonly rules: Readonly<Record<string, unknown>>;
  readonly filename: string;
  readonly chosen: ReadonlySet<string>;
  readonly project: FactProject;
};

export function engineSettings({ rules, filename, chosen, project }: SettingsRequest): string[] {
  return Object.entries(rules).flatMap(([ruleId, setting]) => {
    const facts = chosen.has(ruleId) ? factsOf(ruleId) : undefined;
    const name = pluginRuleName(ruleId);
    return facts === undefined || name === undefined
      ? []
      : Object.entries(facts(filename, optionsOf(setting), project)).map(
          ([key, value]) => `${name}.${key}=${value}`,
        );
  });
}

export function conditionsHold(ruleId: string, conditions: Asked, filename: string): boolean {
  const answers = ENGINE_PLUGIN_RULES.get(pluginRuleName(ruleId) ?? '')?.conditions ?? {};
  return (conditions ?? []).every(([kind, value]) => {
    const condition = answers[kind];
    if (condition === undefined) {
      throw new Error(
        `The engine asked ${ruleId} about ${kind}, which none of its conditions answers.`,
      );
    }
    return condition(value, filename);
  });
}
