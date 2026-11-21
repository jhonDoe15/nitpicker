import { numericAllowance, siteKey } from '../legacy-inventory.mts';
import { RULE_IDS } from '../policy.mts';
import type { Finding } from '../values/findings.mts';
import { fieldOf, textOf } from '../values/readers.mts';
import { hash } from './finding-parts.mts';

export function evaluateBaselineExpansions(
  baseSites: readonly unknown[],
  headSites: readonly unknown[],
  analyzerName: string,
): Finding[] {
  const baseCounts = new Map(
    baseSites.map((site) => [siteKey(site), numericAllowance(fieldOf(site, 'count'))]),
  );
  return headSites.flatMap((site) => {
    const key = siteKey(site);
    const baseCount = baseCounts.get(key) ?? 0;
    const headCount = numericAllowance(fieldOf(site, 'count'));
    if (headCount <= baseCount) {
      return [];
    }
    return [
      {
        tool: analyzerName,
        rule: RULE_IDS.baselineExpansion,
        path: textOf(fieldOf(site, 'file')),
        identity: `site:${hash(key)}`,
        message: `Legacy allowance increased from ${String(baseCount)} to ${String(headCount)} for ${textOf(fieldOf(site, 'rule'))}`,
        classification: 'enforceable',
      },
    ];
  });
}
