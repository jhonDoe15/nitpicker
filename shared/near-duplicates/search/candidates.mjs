import { logicPairs } from '../proof/candidates.mjs';
import { THRESHOLDS } from '../thresholds.mjs';
import { statementHashes } from './hashes.mjs';
import { partnerLimit, similarityPairs } from './similarity.mjs';

const INDEX = { minNodes: THRESHOLDS.indexMinNodes, window: THRESHOLDS.minRunStatements };

function buckets(units) {
  const members = new Map();
  const postings = [...units.entries()].flatMap(([position, unit]) =>
    [...statementHashes(unit.tree, INDEX)].map((key) => [key, position]),
  );
  for (const [key, position] of postings) {
    if (!members.has(key)) {
      members.set(key, []);
    }
    members.get(key).push(position);
  }
  return members.values();
}

function* bucketPairs(members) {
  const limit = partnerLimit(members.length);
  for (const [offset, first] of members.entries()) {
    for (const second of members.slice(offset + 1, offset + 1 + limit)) {
      yield [first, second];
    }
  }
}

function indexPairs(units, inScope, pairs) {
  for (const members of buckets(units)) {
    for (const [first, second] of bucketPairs(members)) {
      pairs.add(inScope(first) || inScope(second) ? first * units.length + second : -1);
    }
  }
  pairs.delete(-1);
}

export function candidatePairs(units, inScope) {
  const pairs = new Set();
  indexPairs(units, inScope, pairs);
  similarityPairs(units, inScope, pairs);
  logicPairs(units, inScope, pairs);
  return [...pairs]
    .sort((left, right) => left - right)
    .map((key) => [Math.floor(key / units.length), key % units.length]);
}
