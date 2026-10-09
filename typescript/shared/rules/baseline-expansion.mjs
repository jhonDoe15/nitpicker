// Baseline-expansion rule, from neutral inputs.
//
// Input: the legacy-baseline sites of the base and of the head, each
//   { file: string, rule: string, source: string, count: number }
// where `count` is the allowance (a positive integer) for that file, rule and source text. A head
// site whose allowance is above the base's (or that is new) is an enforceable `baseline-expansion`
// finding: raising a legacy allowance is never free. Malformed sites throw a TypeError.

import { RULE_IDS } from '../policy.mjs';
import { hash } from './finding-helpers.mjs';

export function evaluateBaselineExpansions(baseSites, headSites, analyzerName) {
  const baseCounts = new Map(baseSites.map((site) => [siteKey(site), allowance(site.count)]));
  return headSites.flatMap((site) => {
    const key = siteKey(site);
    const baseCount = baseCounts.get(key) ?? 0;
    const headCount = allowance(site.count);
    if (headCount <= baseCount) {
      return [];
    }
    return [
      {
        tool: analyzerName,
        rule: RULE_IDS.baselineExpansion,
        path: site.file,
        identity: `site:${hash(key)}`,
        message: `Legacy allowance increased from ${String(baseCount)} to ${String(headCount)} for ${site.rule}`,
        classification: 'enforceable',
      },
    ];
  });
}

function siteKey(site) {
  if (
    typeof site?.file !== 'string' ||
    typeof site.rule !== 'string' ||
    typeof site.source !== 'string'
  ) {
    throw new TypeError('Coding-standard baseline contains an invalid site');
  }
  return JSON.stringify([site.file, site.rule, site.source]);
}

function allowance(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError('Coding-standard baseline counts must be positive integers');
  }
  return value;
}
