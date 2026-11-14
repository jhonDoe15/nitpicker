import { decidedConditions } from './decided.mjs';
import { getterTable, gettersOfFile } from './models/getters.mjs';
import { modelledTree } from './models/annotate.mjs';
import { declaredTypes } from './models/types.mjs';
import { RULE_IDS } from '../../policy.mjs';
import { reuseFinding } from '../reuse/reuse-finding.mjs';

const OUTCOMES = {
  true: { consequence: '', fix: 'Remove the check, or fix the condition that was meant.' },
  false: {
    consequence: ', so the code it guards never runs',
    fix: 'Remove it, or fix the condition that was meant.',
  },
  operand: { consequence: '', fix: 'Remove the operand, or fix the condition that was meant.' },
};

function modelled(unit, getters) {
  const scope = {
    types: declaredTypes(unit.tree),
    getters: gettersOfFile(getters, unit.file),
    owner: /^(?<owner>[\w$]+)\./u.exec(unit.name)?.groups.owner,
    python: unit.file.endsWith('.py'),
    kotlin: unit.file.endsWith('.kt'),
  };
  return modelledTree(unit.tree, scope);
}

function unitFindings(unit, analyzerName, getters) {
  const seen = new Map();
  const tree = modelled(unit, getters);
  return decidedConditions(tree, {
    looseBooleans: unit.file.endsWith('.py'),
    kotlin: unit.file.endsWith('.kt'),
  }).map(({ node, verdict, part, reason }) => {
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
  });
}

export function decidedConditionFindings(units, { analyzerName, isExcepted }) {
  const getters = getterTable(units);
  return units
    .filter((unit) => unit.tree?.kind === 'function')
    .filter((unit) => !isExcepted(RULE_IDS.decidedCondition, unit.file))
    .flatMap((unit) => unitFindings(unit, analyzerName, getters));
}
