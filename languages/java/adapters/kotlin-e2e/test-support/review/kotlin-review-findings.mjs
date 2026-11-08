import { GLOBAL_STATE_FILES, GLOBAL_STATE_FINDINGS } from './kotlin-global-state-data.mjs';
import {
  GENERATED_MEMBER_FILES,
  GENERATED_MEMBER_FINDINGS,
} from './members/kotlin-generated-member-data.mjs';
import { mapUpdateFiles, MAP_UPDATE_FINDINGS } from './kotlin-map-update-data.mjs';
import { EXPECTED_REVIEW_FINDINGS, REVIEW_RULE_FILES } from './kotlin-review-data.mjs';
import { PLURAL_FINDINGS } from './kotlin-plural-data.mjs';

const REVIEW_TOOLS = new Set(['pmd']);

export const ALL_FINDINGS = [
  ...EXPECTED_REVIEW_FINDINGS,
  ...MAP_UPDATE_FINDINGS,
  ...GLOBAL_STATE_FINDINGS,
  ...GENERATED_MEMBER_FINDINGS,
].sort();

export { MAP_UPDATE_FINDINGS, PLURAL_FINDINGS };

export function reviewBranchFiles() {
  return {
    ...REVIEW_RULE_FILES,
    ...mapUpdateFiles(),
    ...GLOBAL_STATE_FILES,
    ...GENERATED_MEMBER_FILES,
  };
}

export function reviewFindings(findings) {
  return findings
    .filter(({ tool, rule }) => REVIEW_TOOLS.has(tool) || rule === 'unused-option')
    .map(({ rule, symbol }) => `${rule} ${symbol}`)
    .sort();
}
