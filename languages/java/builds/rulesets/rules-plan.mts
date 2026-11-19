import { readFileSync } from 'node:fs';
import {
  nitpickerCheckstyleConfig as untypedCheckstyleConfig,
  withGuardChecks as untypedGuardChecks,
} from './checkstyle-config.mts';
import { unformattedCheckstyle as untypedUnformatted } from '../../adapters/tool-config/checkstyle/unformatted-checks.mts';
import { writeGuardRulesets as untypedGuardRulesets } from './pmd-rulesets.mts';
import { textOf, textsOf } from '../../../../shared/values/readers.mts';
import { compilerOf } from '../typed/lint-plan.mts';

export type RulesPlan = Readonly<Record<string, unknown>>;

export const nitpickerCheckstyleConfig: (bundled: string) => string = untypedCheckstyleConfig;
export function withGuardChecks(config: string, files: unknown): string {
  return untypedGuardChecks(config, textsOf(files));
}
export const unformattedCheckstyle: (text: string, indentation: unknown) => string =
  untypedUnformatted;
export function writeGuardRulesets(plan: RulesPlan): string[] {
  return untypedGuardRulesets({
    reportDir: textOf(plan['reportDir']),
    testDirectories: textsOf(plan['testDirectories']),
    compiler: compilerOf(plan['compiler']),
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
