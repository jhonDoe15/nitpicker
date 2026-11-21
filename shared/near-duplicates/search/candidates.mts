import { logicPairs } from '../proof/candidates.mts';
import type { PreparedUnit } from '../tree/tree-types.mts';
import { partnerLimit } from '../thresholds/partner-limit.mts';
import { THRESHOLDS } from '../thresholds/thresholds.mts';
import { statementHashes } from './hashes.mts';
import { similarityPairs } from './similarity.mts';

const INDEX = { minNodes: THRESHOLDS.indexMinNodes, window: THRESHOLDS.minRunStatements };

function buckets(units: readonly PreparedUnit[]): IterableIterator<number[]> {
  const members = new Map<string, number[]>();
  const postings = [...units.entries()].flatMap(([position, unit]) =>
    [...statementHashes(unit.tree, INDEX)].map((key): [string, number] => [key, position]),
  );
  for (const [key, position] of postings) {
    const known = members.get(key);
    if (known === undefined) {
      members.set(key, [position]);
    } else {
      known.push(position);
    }
  }
  return members.values();
}

function* bucketPairs(members: readonly number[]): Generator<[number, number]> {
  const limit = partnerLimit(members.length);
  for (const [offset, first] of members.entries()) {
    for (const second of members.slice(offset + 1, offset + 1 + limit)) {
      yield [first, second];
    }
  }
}

function indexPairs(
  units: readonly PreparedUnit[],
  inScope: (position: number) => boolean,
): Set<number> {
  const pairs = new Set<number>();
  for (const members of buckets(units)) {
    for (const [first, second] of bucketPairs(members)) {
      pairs.add(inScope(first) || inScope(second) ? first * units.length + second : -1);
    }
  }
  pairs.delete(-1);
  return pairs;
}

export function candidatePairs(
  units: readonly PreparedUnit[],
  inScope: (position: number) => boolean,
): [number, number][] {
  const similar = similarityPairs(units, inScope, indexPairs(units, inScope));
  const pairs = new Set([...similar, ...logicPairs(units, inScope)]);
  return [...pairs]
    .sort((left, right) => left - right)
    .map((key) => [Math.floor(key / units.length), key % units.length]);
}
