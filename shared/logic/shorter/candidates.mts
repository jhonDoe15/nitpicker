import { leavesOf, chain, dualOf, negation, skeletonKey } from './skeleton.mts';
import { appendAll } from '../../lists/lists.mts';
import type {
  Candidate,
  Chain,
  Deletion,
  Guard,
  Merge,
  Negation,
  Site,
  Skeleton,
} from '../typed/skeleton-types.mts';

type Inner = Negation | Chain;
type Pair = [number, number];

const MAX_POOL = 6;

function kidsOf(node: Inner): Skeleton[] {
  return node.op === 'not' ? [node.kid] : node.kids;
}

function replaceChild(node: Inner, index: number, child: Skeleton): Skeleton {
  if (node.op === 'not') {
    return negation(child);
  }
  const kids = node.kids.map((kid, at) => (at === index ? child : kid));
  return chain(node.op, kids);
}

function innerNode(node: Skeleton | undefined): Inner {
  if (node === undefined || node.op === 'leaf') {
    throw new TypeError('A path through a skeleton must pass through operators');
  }
  return node;
}

function withReplaced(root: Skeleton, path: number[], replacement: Skeleton): Skeleton {
  const ancestors: Skeleton[] = [root];
  for (const index of path) {
    const kid = kidsOf(innerNode(ancestors.at(-1)))[index];
    if (kid === undefined) {
      throw new TypeError('A path through a skeleton must name existing operands');
    }
    ancestors.push(kid);
  }
  let current = replacement;
  for (const [depth, index] of [...path.entries()].toReversed()) {
    current = replaceChild(innerNode(ancestors[depth]), index, current);
  }
  return current;
}

function chainSites(root: Skeleton): Site[] {
  const sites: Site[] = [];
  const pending: { node: Skeleton; path: number[] }[] = [{ node: root, path: [] }];
  for (const { node, path } of pending) {
    if (node.op === 'and' || node.op === 'or') {
      sites.push({ node, path });
    }
    const kids = node.op === 'leaf' ? [] : kidsOf(node);
    for (const [index, kid] of kids.entries()) {
      pending.push({ node: kid, path: [...path, index] });
    }
  }
  return sites;
}

function holdsAny(node: Skeleton, set: ReadonlySet<unknown>): boolean {
  return leavesOf(node).some((leaf) => set.has(leaf));
}

function deletions({ node, path }: Site, root: Skeleton, guard: Guard): Deletion[] {
  return node.kids.flatMap((kid, index) => {
    const twins = node.kids.filter((other) => skeletonKey(other) === skeletonKey(kid));
    if (holdsAny(kid, guard.pinned) || twins.length > 1) {
      return [];
    }
    const rest = node.kids.filter((_kid, at) => at !== index);
    return [
      {
        kind: 'delete' as const,
        index,
        site: { node, path },
        result: withReplaced(root, path, chain(node.op, rest)),
      },
    ];
  });
}

function atomsOf(kid: Skeleton, op: Chain['op']): Skeleton[] {
  return (kid.op === 'and' || kid.op === 'or') && kid.op === dualOf(op) ? kid.kids : [kid];
}

function subsets(pool: Skeleton[]): Skeleton[][] {
  const full = 2 ** pool.length - 1;
  return Array.from({ length: full - 1 }, (_unused, index) => index + 1).map((mask) =>
    pool.filter((_atom, at) => (mask >> at) % 2 === 1),
  );
}

function isSame(left: Skeleton[], right: Skeleton[]): boolean {
  return (
    left.length === right.length &&
    left.every((atom, index) => {
      const other = right[index];
      return other !== undefined && skeletonKey(atom) === skeletonKey(other);
    })
  );
}

function keptKids(node: Chain, [first, second]: Pair, kept: Skeleton[]): Skeleton[] {
  return node.kids.flatMap((kid, at) => {
    if (at === second) {
      return [];
    }
    return at === first ? [chain(dualOf(node.op), kept)] : [kid];
  });
}

function mergesOfPair(
  { node, path }: Site,
  { root, guard }: { readonly root: Skeleton; readonly guard: Guard },
  pair: Pair,
): Merge[] {
  const [first, second] = pair;
  const firstKid = node.kids[first];
  const secondKid = node.kids[second];
  if (firstKid === undefined || secondKid === undefined) {
    return [];
  }
  const sides = [atomsOf(firstKid, node.op), atomsOf(secondKid, node.op)];
  const pool = sides.flat();
  const isFree = pool.every(
    (atom) => !(holdsAny(atom, guard.pinned) || holdsAny(atom, guard.throwers)),
  );
  if (!isFree || pool.length > MAX_POOL) {
    return [];
  }
  return subsets(pool)
    .filter((atoms) => !sides.some((side) => isSame(side, atoms)))
    .map((kept) => ({
      kind: 'merge' as const,
      first,
      second,
      site: { node, path },
      result: withReplaced(root, path, chain(node.op, keptKids(node, pair, kept))),
    }));
}

function pairMerges(site: Site, root: Skeleton, guard: Guard): Merge[] {
  const { kids } = site.node;
  return kids
    .flatMap((_kid, first) => kids.map((_other, second): Pair => [first, second]))
    .filter(([first, second]) => second > first)
    .flatMap((pair) => mergesOfPair(site, { root, guard }, pair));
}

function hasRepeatedKids(node: Skeleton): boolean {
  if (node.op === 'leaf' || node.op === 'not') {
    return false;
  }
  const keys = node.kids.map((kid) => skeletonKey(kid));
  return new Set(keys).size < keys.length;
}

function childrenOf(node: Skeleton): Skeleton[] {
  if (node.op === 'not') {
    return [node.kid];
  }
  return node.op === 'leaf' ? [] : node.kids;
}

function hasTwins(root: Skeleton): boolean {
  const pending: Skeleton[] = [root];
  for (const node of pending) {
    if (hasRepeatedKids(node)) {
      return true;
    }
    appendAll(pending, childrenOf(node));
  }
  return false;
}

export function candidatesOf(root: Skeleton, guard: Guard): Candidate[] {
  const all = chainSites(root).flatMap((site): (Deletion | Merge)[] => [
    ...deletions(site, root, guard),
    ...pairMerges(site, root, guard),
  ]);
  return all
    .filter((candidate) => !hasTwins(candidate.result))
    .map((candidate, order) => ({ ...candidate, order, size: leavesOf(candidate.result).length }))
    .toSorted((left, right) => left.size - right.size || left.order - right.order);
}
