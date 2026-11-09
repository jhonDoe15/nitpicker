import {
  GLOBAL_STATE_FILES,
  GLOBAL_STATE_FINDINGS,
} from './concurrency/kotlin-global-state-data.mjs';
import { mapUpdateFiles, MAP_UPDATE_FINDINGS } from './concurrency/kotlin-map-update-data.mjs';
import { BLOCKING_RULES } from '../../../kotlin/review-rules/blocking/blocking-findings.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  EXPECTED_LOOKUP_FINDINGS,
  LOOKUP_FILES,
  lookupBuild,
} from './lookups/kotlin-lookup-data.mjs';
import { EXPECTED_REVIEW_FINDINGS, REVIEW_RULE_FILES } from './kotlin-review-data.mjs';
import { PLURAL_FINDINGS } from './kotlin-plural-data.mjs';

const REVIEW_TOOLS = new Set(['pmd']);

export const ALL_FINDINGS = [
  ...EXPECTED_REVIEW_FINDINGS,
  ...EXPECTED_LOOKUP_FINDINGS,
  ...MAP_UPDATE_FINDINGS,
  ...GLOBAL_STATE_FINDINGS,
].sort();

export { EXPECTED_LOOKUP_FINDINGS, MAP_UPDATE_FINDINGS, PLURAL_FINDINGS };

export function reviewBranchFiles(projectRoot) {
  const build = readFileSync(path.join(projectRoot, 'build.gradle.kts'), 'utf8');
  return {
    ...REVIEW_RULE_FILES,
    ...LOOKUP_FILES,
    'build.gradle.kts': lookupBuild(build),
    ...mapUpdateFiles(),
    ...GLOBAL_STATE_FILES,
  };
}

export function reviewFindings(findings) {
  return findings
    .filter(
      ({ tool, rule }) =>
        REVIEW_TOOLS.has(tool) ||
        rule === 'unused-option' ||
        (tool === 'kotlin-source' && BLOCKING_RULES.includes(rule)),
    )
    .map(({ rule, symbol }) => `${rule} ${symbol}`)
    .sort();
}
