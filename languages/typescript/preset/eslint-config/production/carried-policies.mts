import type { Linter } from 'eslint';
import { CARRIED_VARIABLE } from './carried-variable.mts';

export { CARRIED_VARIABLE };

export type ProductionPolicy = {
  readonly rules: Linter.RulesRecord;
  readonly entryPointRules: Linter.RulesRecord;
};

const PRODUCTION_POLICIES: ReadonlyMap<string, ProductionPolicy> = new Map([
  ['eslint-errors', { rules: { 'nitpicker/no-silent-catch': 'error' }, entryPointRules: {} }],
  [
    'eslint-logging',
    {
      rules: {
        'nitpicker/no-production-console': 'error',
        'nitpicker/structured-catch-logging': 'error',
      },
      entryPointRules: {
        'nitpicker/no-production-console': ['error', { allowStandardStreams: true }],
      },
    },
  ],
  [
    'eslint-module-effects',
    { rules: { 'nitpicker/report-module-load-effects': 'error' }, entryPointRules: {} },
  ],
]);

export function productionPolicy(name: string): ProductionPolicy {
  const policy = PRODUCTION_POLICIES.get(name);
  if (policy === undefined) {
    throw new Error(`Unknown production policy ${name}`);
  }
  return policy;
}

export function carriedPolicyNames(
  environment: Readonly<Record<string, string | undefined>>,
): string[] {
  return (environment[CARRIED_VARIABLE] ?? '')
    .split(',')
    .filter((name) => PRODUCTION_POLICIES.has(name));
}

export function carriedPolicyOf(rule: string, names: readonly string[]): string | undefined {
  return names.find((name) => Object.hasOwn(productionPolicy(name).rules, rule));
}
