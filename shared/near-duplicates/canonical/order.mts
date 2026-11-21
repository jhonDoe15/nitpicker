import { compareText, keyOf } from '../tree/keys.mts';
import { isBound, present } from '../tree/nodes.mts';
import type { KeyMode, TreeNode } from '../tree/tree-types.mts';
import { accessesOf, isStable } from './effects.mts';

type Item = {
  readonly statement: TreeNode;
  readonly index: number;
  readonly reads: ReadonlySet<string>;
  readonly writes: ReadonlySet<string>;
  readonly movable: boolean;
  readonly after: Item[];
  waiting: number;
  rank: number;
};

export type OrderContext = { readonly escaping: ReadonlySet<string>; readonly mode: KeyMode };

function movable(statement: TreeNode, escaping: ReadonlySet<string>): boolean {
  if (statement.kind !== 'declare') {
    return false;
  }
  const [, name, value] = statement.children;
  return isBound(name) && !escaping.has(name.value) && isStable(present(value), escaping);
}

function describe(
  statement: TreeNode,
  index: number,
  escaping: ReadonlySet<string>,
): Omit<Item, 'after'> {
  const { reads, writes } = accessesOf(statement);
  return {
    statement,
    index,
    reads,
    writes,
    movable: movable(statement, escaping),
    waiting: 0,
    rank: 0,
  };
}

function listed(map: ReadonlyMap<string, Item[]>, names: Iterable<string>): Item[] {
  return [...names].flatMap((name) => map.get(name) ?? []);
}

function remember(map: Map<string, Item[]>, names: Iterable<string>, item: Item): void {
  for (const name of names) {
    const known = map.get(name);
    if (known === undefined) {
      map.set(name, [item]);
    } else {
      known.push(item);
    }
  }
}

function linkDependencies(items: readonly Item[]): void {
  const writers = new Map<string, Item[]>();
  const readers = new Map<string, Item[]>();
  let fixed: Item | undefined;
  for (const item of items) {
    const earlier = [
      ...(item.movable || fixed === undefined ? [] : [fixed]),
      ...listed(writers, item.reads),
      ...listed(writers, item.writes),
      ...listed(readers, item.writes),
    ];
    const distinct = new Set(earlier);
    item.waiting = distinct.size;
    for (const other of distinct) {
      other.after.push(item);
    }
    remember(writers, item.writes, item);
    remember(readers, item.reads, item);
    fixed = item.movable ? fixed : item;
  }
}

function ranked(items: readonly Item[], mode: KeyMode): void {
  const keys = items.map((item) => keyOf(item.statement, mode));
  const order = items.toSorted(
    (left, right) =>
      compareText(present(keys[left.index]), present(keys[right.index])) ||
      left.index - right.index,
  );
  for (const [rank, item] of order.entries()) {
    item.rank = rank;
  }
}

function placeNext(ready: Item[]): Item {
  const next = ready.reduce((best, item) => (item.rank < best.rank ? item : best));
  ready.splice(ready.indexOf(next), 1);
  for (const later of next.after) {
    later.waiting -= 1;
    if (later.waiting === 0) {
      ready.push(later);
    }
  }
  return next;
}

function placeAll(items: readonly Item[]): Item[] {
  const ready = items.filter((item) => item.waiting === 0);
  return items.map(() => placeNext(ready));
}

export function canonicalOrder(
  statements: readonly TreeNode[],
  { escaping, mode }: OrderContext,
): readonly TreeNode[] {
  if (statements.length < 2 || !statements.some((statement) => movable(statement, escaping))) {
    return statements;
  }
  const items: Item[] = statements.map((statement, index) => ({
    ...describe(statement, index, escaping),
    after: [],
  }));
  linkDependencies(items);
  ranked(items, mode);
  return placeAll(items).map((item) => item.statement);
}
