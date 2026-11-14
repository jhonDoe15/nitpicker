import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  nitpickerCheckstyleConfig,
  planText,
  readPlan,
  type RulesPlan,
  unformattedCheckstyle,
  withGuardChecks,
  writeGuardRulesets,
} from './rules-plan.mts';

export const PMD_RULESETS_LIST = 'pmd-rulesets.txt';

export function writeRules(kind: string | undefined, plan: RulesPlan): void {
  if (kind === 'pmd-guards') {
    writeFileSync(
      path.join(planText(plan, 'reportDir'), PMD_RULESETS_LIST),
      writeGuardRulesets(plan).join(','),
    );
    return;
  }
  if (kind === 'checkstyle-config') {
    const config = nitpickerCheckstyleConfig(readFileSync(planText(plan, 'source'), 'utf8'));
    writeFileSync(
      planText(plan, 'output'),
      plan['javaStyle'] === 'none' ? unformattedCheckstyle(config, plan['indentation']) : config,
    );
    return;
  }
  if (kind === 'checkstyle-guards') {
    writeFileSync(
      planText(plan, 'output'),
      withGuardChecks(readFileSync(planText(plan, 'source'), 'utf8'), plan['files']),
    );
    return;
  }
  throw new Error(`unknown rule configuration kind: ${String(kind)}`);
}

export function main([kind, planFile]: readonly string[]): void {
  writeRules(kind, readPlan(planFile ?? ''));
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  main(process.argv.slice(2));
}
