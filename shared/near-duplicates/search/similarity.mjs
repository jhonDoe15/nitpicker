import { THRESHOLDS } from '../thresholds.mjs';
import { skeletonKey } from './skeleton.mjs';
import { bagOverlap, lcsLength, similarEnough } from './tokens.mjs';

export function partnerLimit(size) {
  return size > THRESHOLDS.fullBucket ? THRESHOLDS.bucketNeighbours : size;
}

function similar(left, right) {
  const percent = THRESHOLDS.minSharedPercent;
  const lengths = [left.tokens.length, right.tokens.length];
  return (
    similarEnough(Math.min(...lengths), lengths, percent) &&
    similarEnough(bagOverlap(left.bag, right.bag), lengths, percent) &&
    similarEnough(lcsLength(left.masks, right.tokens), lengths, percent)
  );
}

function groups(units) {
  const members = new Map();
  for (const [position, unit] of units.entries()) {
    const key = skeletonKey(unit.tree);
    if (!members.has(key)) {
      members.set(key, []);
    }
    members.get(key).push(position);
  }
  return [...members.values()].filter((group) => group.length > 1);
}

function lengthsFits(shorter, longer) {
  return similarEnough(shorter, [shorter, longer], THRESHOLDS.minSharedPercent);
}

function* groupPairs(units, group) {
  const lengths = group.map((position) => units[position].tokens.length);
  const lengthOf = new Map(group.map((position, at) => [position, lengths[at]]));
  const order = group.toSorted(
    (left, right) => lengthOf.get(left) - lengthOf.get(right) || left - right,
  );
  for (const [at, shorter] of order.entries()) {
    const longer = order.slice(at + 1, at + 1 + partnerLimit(order.length));
    const end = longer.findIndex(
      (other) => !lengthsFits(lengthOf.get(shorter), lengthOf.get(other)),
    );
    yield* longer.slice(0, end === -1 ? longer.length : end).map((other) => [shorter, other]);
  }
}

export function similarityPairs(units, inScope, pairs) {
  for (const group of groups(units).filter((members) => members.some(inScope))) {
    for (const [one, other] of groupPairs(units, group)) {
      const [left, right] = one < other ? [one, other] : [other, one];
      const pair = left * units.length + right;
      const wanted = (inScope(left) || inScope(right)) && !pairs.has(pair);
      pairs.add(wanted && similar(units[left], units[right]) ? pair : -1);
    }
  }
  pairs.delete(-1);
}
