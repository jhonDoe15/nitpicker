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
import {
  SPOTBUGS_ENGINE_ARGUMENTS,
  spotbugsOnEngine,
  spotbugsPlanOf,
} from '../spotbugs/spotbugs-engine.mts';

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
      pmdRulesetsWithEngine(engine, process.env, { log: process.stderr }).join(','),
    );
  }
}

function writeSpotbugsEngine(plan: RulesPlan): void {
  const engine = spotbugsPlanOf(plan);
  const added = spotbugsOnEngine(engine, process.env, { log: process.stderr });
  writeFileSync(path.join(engine.reportDir, SPOTBUGS_ENGINE_ARGUMENTS), added.join('\n'));
}

function writeCheckstyleConfig(plan: RulesPlan): void {
  const config = nitpickerCheckstyleConfig(readFileSync(planText(plan, 'source'), 'utf8'));
  const unformatted = plan['javaStyle'] === 'none';
  writeFileSync(
    planText(plan, 'output'),
    reportingCheckstyleConfig(
      unformatted ? unformattedCheckstyle(config, plan['indentation']) : config,
      unformatted ? 'unformatted' : 'formatted',
    ),
  );
}

function writeCheckstyleGuards(plan: RulesPlan): void {
  writeFileSync(
    planText(plan, 'output'),
    withGuardChecks(readFileSync(planText(plan, 'source'), 'utf8'), plan['files']),
  );
}

const WRITERS = new Map<string, (plan: RulesPlan) => void>([
  ['pmd-guards', writePmdRulesets],
  [
    'errorprone-engine',
    (plan) => {
      errorProneOnEngine(errorPronePlanOf(plan), process.env, { log: process.stderr });
    },
  ],
  [
    'cpd-engine',
    (plan) => {
      cpdOnEngine(cpdPlanOf(plan), process.env, { log: process.stderr });
    },
  ],
  ['spotbugs-engine', writeSpotbugsEngine],
  ['checkstyle-config', writeCheckstyleConfig],
  ['checkstyle-guards', writeCheckstyleGuards],
]);

export function writeRules(kind: string | undefined, plan: RulesPlan): void {
  const write = kind === undefined ? undefined : WRITERS.get(kind);
  if (write === undefined) {
    throw new Error(`unknown rule configuration kind: ${String(kind)}`);
  }
  write(plan);
}

export function main([kind, planFile]: readonly string[]): void {
  writeRules(kind, readPlan(planFile ?? ''));
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  main(process.argv.slice(2));
}
