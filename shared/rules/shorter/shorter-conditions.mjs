import { RULE_IDS } from '../../policy.mjs';
import { functionUnitRule, identityCounter, reuseFinding } from '../reuse/reuse-finding.mjs';
import { shorterConditions } from './condition-sites.mjs';

function unitFindings(unit, analyzerName) {
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

export const shorterConditionFindings = functionUnitRule(RULE_IDS.shorterCondition, unitFindings);
