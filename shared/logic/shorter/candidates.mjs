import { leavesOf, chain, dualOf, negation, skeletonKey } from './skeleton.mjs';

const MAX_POOL = 6;

function kidsOf(node) {
  return node.op === 'not' ? [node.kid] : node.kids;
}

function replaceChild(node, index, child) {
  if (node.op === 'not') {
    return negation(child);
  }
  const kids = node.kids.map((kid, at) => (at === index ? child : kid));
  return chain(node.op, kids);
}

function withReplaced(root, path, replacement) {
  const ancestors = [root];
  for (const index of path) {
    ancestors.push(kidsOf(ancestors.at(-1))[index]);
  }
  let current = replacement;
  for (const [depth, index] of path.entries().toArray().toReversed()) {
    current = replaceChild(ancestors[depth], index, current);
  }
  return current;
}

function chainSites(root) {
  const sites = [];
  const pending = [{ node: root, path: [] }];
  for (const { node, path } of pending) {
    if (node.op === 'and' || node.op === 'or') {
      sites.push({ node, path });
    }
    kidsOf(node.op === 'leaf' ? { op: 'and', kids: [] } : node).forEach((kid, index) => {
      pending.push({ node: kid, path: [...path, index] });
    });
  }
  return sites;
}

function holdsAny(node, set) {
  return leavesOf(node).some((leaf) => set.has(leaf));
}

function deletions({ node, path }, root, guard) {
  return node.kids.flatMap((kid, index) => {
    const twins = node.kids.filter((other) => skeletonKey(other) === skeletonKey(kid));
    if (holdsAny(kid, guard.pinned) || twins.length > 1) {
      return [];
    }
    const rest = node.kids.filter((_kid, at) => at !== index);
    return [
      {
        kind: 'delete',
        index,
        site: { node, path },
        result: withReplaced(root, path, chain(node.op, rest)),
      },
    ];
  });
}

function atomsOf(kid, op) {
  return kid.op === dualOf(op) ? kid.kids : [kid];
}

function subsets(pool) {
  const full = 2 ** pool.length - 1;
  return Array.from({ length: full - 1 }, (_unused, index) => index + 1).map((mask) =>
    pool.filter((_atom, at) => (mask >> at) % 2 === 1),
  );
}

function isSame(left, right) {
  return (
    left.length === right.length &&
    left.every((atom, index) => skeletonKey(atom) === skeletonKey(right[index]))
  );
}

function keptKids(node, [first, second], kept) {
  return node.kids.flatMap((kid, at) => {
    if (at === second) {
      return [];
    }
    return at === first ? [chain(dualOf(node.op), kept)] : [kid];
  });
}

function mergesOfPair({ node, path }, { root, guard }, pair) {
  const [first, second] = pair;
  const sides = [atomsOf(node.kids[first], node.op), atomsOf(node.kids[second], node.op)];
  const pool = sides.flat();
  const isFree = pool.every(
    (atom) => !holdsAny(atom, guard.pinned) && !holdsAny(atom, guard.throwers),
  );
  if (!isFree || pool.length > MAX_POOL) {
    return [];
  }
  return subsets(pool)
    .filter((atoms) => !sides.some((side) => isSame(side, atoms)))
    .map((kept) => ({
      kind: 'merge',
      first,
      second,
      site: { node, path },
      result: withReplaced(root, path, chain(node.op, keptKids(node, pair, kept))),
    }));
}

function pairMerges(site, root, guard) {
  const { kids } = site.node;
  return kids
    .flatMap((_kid, first) => kids.map((_other, second) => [first, second]))
    .filter(([first, second]) => second > first)
    .flatMap((pair) => mergesOfPair(site, { root, guard }, pair));
}

function hasRepeatedKids(node) {
  if (node.op === 'leaf' || node.op === 'not') {
    return false;
  }
  const keys = node.kids.map((kid) => skeletonKey(kid));
  return new Set(keys).size < keys.length;
}

function childrenOf(node) {
  if (node.op === 'not') {
    return [node.kid];
  }
  return node.op === 'leaf' ? [] : node.kids;
}

function hasTwins(root) {
  const pending = [root];
  for (const node of pending) {
    if (hasRepeatedKids(node)) {
      return true;
    }
    pending.push(...childrenOf(node));
  }
  return false;
}

/** The conditions with fewer leaves that drop an operand or merge two operands of one chain. */
export function candidatesOf(root, guard) {
  const all = chainSites(root).flatMap((site) => [
    ...deletions(site, root, guard),
    ...pairMerges(site, root, guard),
  ]);
  return all
    .filter((candidate) => !hasTwins(candidate.result))
    .map((candidate, order) => ({ ...candidate, order, size: leavesOf(candidate.result).length }))
    .toSorted((left, right) => left.size - right.size || left.order - right.order);
}
