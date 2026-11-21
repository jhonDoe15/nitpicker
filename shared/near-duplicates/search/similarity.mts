import { partnerLimit } from '../thresholds/partner-limit.mts';
import { THRESHOLDS } from '../thresholds/thresholds.mts';
import { skeletonKey } from './skeleton.mts';
import { bagOverlap, lcsLength, similarEnough } from './tokens.mts';
import { smallest } from '../../lists/lists.mts';
import { present } from '../tree/nodes.mts';
import type { PreparedUnit } from '../tree/tree-types.mts';

function similar(left: PreparedUnit, right: PreparedUnit): boolean {
  const percent = THRESHOLDS.minSharedPercent;
  const lengths: [number, number] = [left.tokens.length, right.tokens.length];
  return (
    similarEnough(smallest(lengths), lengths, percent) &&
    similarEnough(bagOverlap(left.bag, right.bag), lengths, percent) &&
    similarEnough(lcsLength(left.masks, right.tokens), lengths, percent)
  );
}

function groups(units: readonly PreparedUnit[]): number[][] {
  const members = new Map<string, number[]>();
  for (const [position, unit] of units.entries()) {
    const key = skeletonKey(unit.tree);
    const known = members.get(key);
    if (known === undefined) {
      members.set(key, [position]);
    } else {
      known.push(position);
    }
  }
  return [...members.values()].filter((group) => group.length > 1);
}

function lengthsFits(shorter: number, longer: number): boolean {
  return similarEnough(shorter, [shorter, longer], THRESHOLDS.minSharedPercent);
}

function* groupPairs(
  units: readonly PreparedUnit[],
  group: readonly number[],
): Generator<[number, number]> {
  const lengthOf = new Map(
    group.map((position): [number, number] => [position, present(units[position]).tokens.length]),
  );
  function lengthAt(position: number): number {
    return present(lengthOf.get(position));
  }
  const order = group.toSorted((left, right) => lengthAt(left) - lengthAt(right) || left - right);
  for (const [at, shorter] of order.entries()) {
    const longer = order.slice(at + 1, at + 1 + partnerLimit(order.length));
    const end = longer.findIndex((other) => !lengthsFits(lengthAt(shorter), lengthAt(other)));
    yield* longer
      .slice(0, end === -1 ? longer.length : end)
      .map((other): [number, number] => [shorter, other]);
  }
}

export function similarityPairs(
  units: readonly PreparedUnit[],
  inScope: (position: number) => boolean,
  known: ReadonlySet<number>,
): Set<number> {
  const pairs = new Set(known);
  for (const group of groups(units).filter((members) => members.some(inScope))) {
    for (const [one, other] of groupPairs(units, group)) {
      const [left, right] = one < other ? [one, other] : [other, one];
      const pair = left * units.length + right;
      const wanted = (inScope(left) || inScope(right)) && !pairs.has(pair);
      pairs.add(wanted && similar(present(units[left]), present(units[right])) ? pair : -1);
    }
  }
  pairs.delete(-1);
  return pairs;
}
