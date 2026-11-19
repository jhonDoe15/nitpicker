import type { TSESLint } from '@typescript-eslint/utils';
import type { FixPlan } from '../support/ranges.mts';

export type FixPlans = (fixer: TSESLint.RuleFixer) => TSESLint.RuleFix[];

export function allOf(plans: readonly (FixPlan | undefined)[]): FixPlans | undefined {
  const present = plans.filter((plan): plan is FixPlan => plan !== undefined);
  if (present.length !== plans.length || present.length === 0) {
    return undefined;
  }
  return (fixer) => present.map((plan) => plan(fixer));
}
