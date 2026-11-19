import type { RuleRef } from '../../../../../core/fix/typed/fix-types.mts';

type TwinRule = RuleRef & { readonly check: string };

const TWIN_RULES: readonly TwinRule[] = Object.freeze([
  { check: 'UnusedMethod', tool: 'pmd', rule: 'UnusedPrivateMethod' },
  { check: 'UnusedMethod', tool: 'spotbugs', rule: 'UPM_UNCALLED_PRIVATE_METHOD' },
  { check: 'MissingOverride', tool: 'pmd', rule: 'MissingOverride' },
  { check: 'ExplicitArrayForVarargs', tool: 'pmd', rule: 'UnnecessaryVarargsArrayCreation' },
]);

export function twinsOf(check: string): RuleRef[] {
  return TWIN_RULES.filter((twin) => twin.check === check).map(({ tool, rule }) => ({
    tool,
    rule,
  }));
}

export function twinChecks(selectedRules: readonly string[]): string[] {
  const names = new Set(selectedRules);
  return TWIN_RULES.filter(({ tool, rule }) => names.has(`${tool}/${rule}`)).map(
    ({ check }) => check,
  );
}
