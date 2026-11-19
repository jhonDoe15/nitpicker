import { ISOLATION_FILES, ISOLATION_FINDINGS } from './isolation/kotlin-isolation-data.mts';
import {
  GLOBAL_STATE_FILES,
  GLOBAL_STATE_FINDINGS,
} from './concurrency/kotlin-global-state-data.mts';
import { mapUpdateFiles, MAP_UPDATE_FINDINGS } from './concurrency/kotlin-map-update-data.mts';
import { BLOCKING_RULES } from '../../../kotlin/review-rules/blocking/blocking-findings.mts';
import { readFileSync } from 'node:fs';
import type { Finding } from '../../../../../../shared/values/findings.mts';
import path from 'node:path';
import {
  EXPECTED_LOOKUP_FINDINGS,
  LOOKUP_FILES,
  lookupBuild,
} from './lookups/kotlin-lookup-data.mts';
import {
  GENERATED_MEMBER_FILES,
  GENERATED_MEMBER_FINDINGS,
} from './members/kotlin-generated-member-data.mts';
import { EXPECTED_REVIEW_FINDINGS, REVIEW_RULE_FILES } from './kotlin-review-data.mts';
import { PLURAL_FINDINGS } from './kotlin-plural-data.mts';

const REVIEW_TOOLS = new Set(['pmd']);

export const ALL_FINDINGS = [
  ...EXPECTED_REVIEW_FINDINGS,
  ...EXPECTED_LOOKUP_FINDINGS,
  ...MAP_UPDATE_FINDINGS,
  ...GLOBAL_STATE_FINDINGS,
  ...ISOLATION_FINDINGS,
  ...GENERATED_MEMBER_FINDINGS,
].sort();

export { EXPECTED_LOOKUP_FINDINGS, MAP_UPDATE_FINDINGS, PLURAL_FINDINGS };

export function reviewBranchFiles(projectRoot: string): Record<string, string | Uint8Array> {
  const build = readFileSync(path.join(projectRoot, 'build.gradle.kts'), 'utf8');
  return {
    ...REVIEW_RULE_FILES,
    ...LOOKUP_FILES,
    'build.gradle.kts': lookupBuild(build),
    ...mapUpdateFiles(),
    ...GLOBAL_STATE_FILES,
    ...GENERATED_MEMBER_FILES,
    ...ISOLATION_FILES,
  };
}

export function reviewFindings(findings: readonly Finding[]): string[] {
  return findings
    .filter(
      ({ tool, rule }) =>
        REVIEW_TOOLS.has(tool) ||
        rule === 'unused-option' ||
        (tool === 'kotlin-source' && BLOCKING_RULES.includes(rule)),
    )
    .map(({ rule, symbol }) => `${rule} ${String(symbol)}`)
    .sort();
}
