import { RULE_IDS } from '../../policy.mts';
import { functionUnitRule, identityCounter, reuseFinding } from '../reuse/reuse-finding.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import type { Finding } from '../../values/findings.mts';
import { shorterConditions } from './condition-sites.mts';
import { settledAhead } from '../../logic/sync/decide-sync.mts';

type ShorterUnit = { readonly file: string; readonly name: string; readonly tree: TreeNode };

function unitFindings(unit: ShorterUnit, analyzerName: string): Finding[] {
  const numbered = identityCounter();
  const kotlin = unit.file.endsWith('.kt');
  const options = {
    isPython: unit.file.endsWith('.py'),
    kotlin,
    references: kotlin || unit.file.endsWith('.java'),
  };
  return shorterConditions(unit.tree, options).map(({ node, condition, form, reason }) => {
    const base = `${unit.file}#${unit.name}:${condition}`;
    return reuseFinding(analyzerName, {
      key: 'shorterCondition',
      path: unit.file,
      identity: numbered(`shorter-condition:${base}`),
      symbol: unit.name,
      line: node.start,
      values: { condition, form, reason },
    });
  });
}

export const shorterConditionFindings = functionUnitRule(
  RULE_IDS.shorterCondition,
  (unit: ShorterUnit, analyzerName) => settledAhead(unit, () => unitFindings(unit, analyzerName)),
);
