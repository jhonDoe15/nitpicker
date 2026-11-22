import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  nitpickerCheckstyleConfig,
  planText,
  readPlan,
  reportingCheckstyleConfig,
  type RulesPlan,
  unformattedCheckstyle,
  withGuardChecks,
  writeGuardRulesets,
} from './rules-plan.mts';
import { enginePlanOf, pmdRulesetsWithEngine } from './engine/pmd-engine.mts';
import { errorProneOnEngine, errorPronePlanOf } from '../errorprone/errorprone-engine.mts';
import { cpdOnEngine, cpdPlanOf } from '../cpd/cpd-engine.mts';

export const PMD_RULESETS_LIST = 'pmd-rulesets.txt';
export const PMD_RUN_RULESETS_LIST = 'pmd-run-rulesets.txt';

function writePmdRulesets(plan: RulesPlan): void {
  const reportDir = planText(plan, 'reportDir');
  const guards = writeGuardRulesets(plan);
  writeFileSync(path.join(reportDir, PMD_RULESETS_LIST), guards.join(','));
  const engine = enginePlanOf(plan['engine'], reportDir, guards);
  if (engine !== undefined) {
    writeFileSync(
      path.join(reportDir, PMD_RUN_RULESETS_LIST),
      pmdRulesetsWithEngine(engine, process.env).join(','),
    );
  }
}

export function writeRules(kind: string | undefined, plan: RulesPlan): void {
  if (kind === 'pmd-guards') {
    writePmdRulesets(plan);
    return;
  }
  if (kind === 'errorprone-engine') {
    errorProneOnEngine(errorPronePlanOf(plan), process.env, { log: process.stderr });
    return;
  }
  if (kind === 'cpd-engine') {
    cpdOnEngine(cpdPlanOf(plan), process.env, { log: process.stderr });
    return;
  }
  if (kind === 'checkstyle-config') {
    const config = nitpickerCheckstyleConfig(readFileSync(planText(plan, 'source'), 'utf8'));
    const unformatted = plan['javaStyle'] === 'none';
    writeFileSync(
      planText(plan, 'output'),
      reportingCheckstyleConfig(
        unformatted ? unformattedCheckstyle(config, plan['indentation']) : config,
        unformatted ? 'unformatted' : 'formatted',
      ),
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
