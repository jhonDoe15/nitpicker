import { partnerLimit } from '../thresholds/partner-limit.mts';
import { THRESHOLDS } from '../thresholds/thresholds.mts';
import { compareText } from '../tree/keys.mts';
import type { PreparedUnit } from '../tree/tree-types.mts';
import { fallbackKey, outcomesOf, programOf } from './program.mts';

const MIN_OUTCOMES = 2;

function logicKey({ unit, tree, size }: PreparedUnit): string | undefined {
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

function logicGroups(units: readonly PreparedUnit[]): number[][] {
  const members = new Map<string, number[]>();
  for (const [position, unit] of units.entries()) {
    const key = logicKey(unit);
    if (key !== undefined) {
      members.set(key, [...(members.get(key) ?? []), position]);
    }
  }
  return [...members.values()].filter((group) => group.length > 1);
}

function groupPairs(
  group: readonly number[],
  inScope: (position: number) => boolean,
  count: number,
): number[] {
  const limit = partnerLimit(group.length);
  return group.flatMap((first, offset) =>
    group
      .slice(offset + 1, offset + 1 + limit)
      .filter((second) => inScope(first) || inScope(second))
      .map((second) => first * count + second),
  );
}

export function logicPairs(
  units: readonly PreparedUnit[],
  inScope: (position: number) => boolean,
): number[] {
  return logicGroups(units)
    .filter((members) => members.some(inScope))
    .flatMap((group) => groupPairs(group, inScope, units.length));
}
