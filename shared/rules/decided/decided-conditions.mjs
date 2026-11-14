import { decidedConditions } from './decided.mjs';
import { RULE_IDS } from '../../policy.mjs';
import { functionUnitRule, reuseFinding } from '../reuse/reuse-finding.mjs';

const OUTCOMES = {
  true: { consequence: '', fix: 'Remove the check, or fix the condition that was meant.' },
  false: {
    consequence: ', so the code it guards never runs',
    fix: 'Remove it, or fix the condition that was meant.',
  },
  operand: { consequence: '', fix: 'Remove the operand, or fix the condition that was meant.' },
};

function unitFindings(unit, analyzerName) {
  const seen = new Map();
  return decidedConditions(unit.tree, { looseBooleans: unit.file.endsWith('.py') }).map(
    ({ node, verdict, part, reason }) => {
      const condition = node.text ?? `the condition on line ${String(node.start)}`;
      const base = `${unit.file}#${unit.name}:${verdict}:${condition}`;
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      return reuseFinding(analyzerName, {
        key: 'decidedCondition',
        path: unit.file,
        identity: `decided-condition:${base}#${String(count)}`,
        symbol: unit.name,
        line: node.start,
        values: { condition, verdict, reason, ...OUTCOMES[part === 'operand' ? part : verdict] },
      });
    },
  );
}

export const decidedConditionFindings = functionUnitRule(RULE_IDS.decidedCondition, unitFindings);
