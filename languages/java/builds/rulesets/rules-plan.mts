import { readFileSync } from 'node:fs';
import {
  nitpickerCheckstyleConfig as untypedCheckstyleConfig,
  withGuardChecks as untypedGuardChecks,
} from './checkstyle-config.mjs';
import { unformattedCheckstyle as untypedUnformatted } from '../../adapters/tool-config/checkstyle/unformatted-checks.mjs';
import { writeGuardRulesets as untypedGuardRulesets } from './pmd-rulesets.mjs';

export type RulesPlan = Readonly<Record<string, unknown>>;

export const nitpickerCheckstyleConfig: (bundled: string) => string = untypedCheckstyleConfig;
export const withGuardChecks: (config: string, files: unknown) => string = untypedGuardChecks;
export const unformattedCheckstyle: (text: string, indentation: unknown) => string =
  untypedUnformatted;
const guardRulesets: (plan: {
  readonly reportDir: unknown;
  readonly testDirectories: unknown;
  readonly compiler: unknown;
}) => string[] = untypedGuardRulesets;

export function writeGuardRulesets(plan: RulesPlan): string[] {
  return guardRulesets({
    reportDir: plan['reportDir'],
    testDirectories: plan['testDirectories'],
    compiler: plan['compiler'],
  });
}

export function readPlan(file: string): RulesPlan {
  const plan: unknown = JSON.parse(
    readFileSync(file, 'utf8'),
    (_: string, value: unknown) => value ?? undefined,
  );
  if (typeof plan !== 'object' || plan === null || Array.isArray(plan)) {
    throw new TypeError(`${file} must hold a rule configuration plan object`);
  }
  return Object.fromEntries(Object.entries(plan));
}

export function planText(plan: RulesPlan, key: string): string {
  const value = plan[key];
  if (typeof value !== 'string') {
    throw new TypeError(`The rule configuration plan needs a string ${key}`);
  }
  return value;
}
