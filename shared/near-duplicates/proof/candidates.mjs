import { partnerLimit } from '../search/similarity.mjs';
import { THRESHOLDS } from '../thresholds.mjs';
import { compareText } from '../tree/keys.mjs';
import { fallbackKey, outcomesOf, programOf } from './program.mjs';

const MIN_OUTCOMES = 2;

function logicKey({ unit, tree, size }) {
  if (size < THRESHOLDS.minSharedNodes) {
    return undefined;
  }
  const program = programOf(unit, tree);
  const outcomes = outcomesOf(program, tree);
  if (outcomes === undefined || outcomes.length < MIN_OUTCOMES) {
    return undefined;
  }
  const keys = outcomes.map(({ key }) => key).sort(compareText);
  return JSON.stringify([...keys, fallbackKey(program, tree)]);
}

function logicGroups(units) {
  const members = new Map();
  for (const [position, unit] of units.entries()) {
    const key = logicKey(unit);
    if (key !== undefined) {
      members.set(key, [...(members.get(key) ?? []), position]);
    }
  }
  return [...members.values()].filter((group) => group.length > 1);
}

function groupPairs(group, inScope, count) {
  const limit = partnerLimit(group.length);
  return group.flatMap((first, offset) =>
    group
      .slice(offset + 1, offset + 1 + limit)
      .filter((second) => inScope(first) || inScope(second))
      .map((second) => first * count + second),
  );
}

export function logicPairs(units, inScope, pairs) {
  for (const group of logicGroups(units).filter((members) => members.some(inScope))) {
    for (const pair of groupPairs(group, inScope, units.length)) {
      pairs.add(pair);
    }
  }
}
