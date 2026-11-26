import { nativeRuleIndex, PARITY_BRIDGED_RULES, translateRule } from '../oxlint-translation.mts';
import type { OxlintPlan, PlanGroup } from './oxlint-shapes.mts';

export type TypedMode = string | undefined;

export function residualRules(plan: OxlintPlan, group: PlanGroup): string[] {
  const typed = new Set(plan.typedPluginRules);
  const context = {
    nativeRules: nativeRuleIndex(plan.nativeRules),
    bridgedRules: PARITY_BRIDGED_RULES,
  };
  return [
    ...Object.keys(group.rules).filter(
      (ruleId) => typed.has(ruleId) && translateRule(ruleId, context).plugin !== undefined,
    ),
    ...(group.programRules ?? []),
  ];
}

export function typedGroups(
  plan: OxlintPlan,
  mode: TypedMode,
  typed: ReadonlySet<string>,
): PlanGroup[] {
  return plan.groups.filter((group) => {
    const residual = residualRules(plan, group);
    if (mode === 'off' || !residual.some((ruleId) => typed.has(ruleId))) {
      return false;
    }
    return mode === 'always' || residual.every((ruleId) => typed.has(ruleId));
  });
}
