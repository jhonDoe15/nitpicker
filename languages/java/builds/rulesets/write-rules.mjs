import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { withGuardChecks, writeCheckstyleConfigs } from './checkstyle-config.mjs';
import { writeGuardRulesets, writePmdRulesets } from './pmd-rulesets.mjs';

export const PMD_RULESETS_LIST = 'pmd-rulesets.txt';

export function writeRules(kind, plan) {
  if (kind === 'pmd-guards') {
    writeFileSync(path.join(plan.reportDir, PMD_RULESETS_LIST), writeGuardRulesets(plan).join(','));
    return;
  }
  if (kind === 'pmd') {
    const rulesets = writePmdRulesets(plan);
    writeFileSync(path.join(plan.reportDir, PMD_RULESETS_LIST), rulesets.join(','));
    return;
  }
  if (kind === 'checkstyle-guards') {
    writeFileSync(plan.output, withGuardChecks(readFileSync(plan.source, 'utf8'), plan.files));
    return;
  }
  if (kind === 'checkstyle') {
    writeCheckstyleConfigs(plan);
    return;
  }
  throw new Error(`unknown rule configuration kind: ${String(kind)}`);
}

function readPlan(file) {
  return JSON.parse(readFileSync(file, 'utf8'), (_, value) => value ?? undefined);
}

export function main([kind, planFile]) {
  writeRules(kind, readPlan(planFile));
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  main(process.argv.slice(2));
}
