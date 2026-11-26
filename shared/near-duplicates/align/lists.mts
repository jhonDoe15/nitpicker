import { chainOf } from '../../traversal.mts';
import { THRESHOLDS } from '../thresholds/thresholds.mts';
import { KEY_MODES } from '../tree/keys.mts';
import { appendAll, categoryOf, isTypeSlot, present } from '../tree/nodes.mts';
import type { KeyCache, Side, TreeNode } from '../tree/tree-types.mts';

export type Table = { readonly table: Int32Array; readonly width: number };
type Cursor = { readonly i: number; readonly j: number };
type Pair = readonly [number, number];

export type Slot =
  | { readonly side: Side; readonly node: TreeNode }
  | { readonly pair: readonly [TreeNode, TreeNode] };

function slotLabel(node: TreeNode, child: TreeNode, index: number): string {
  if (isTypeSlot(node, index)) {
    return 'type';
  }
  return categoryOf(child) === 'expression' && node.kind !== 'evaluate' ? 'expression' : child.kind;
}

export function coarseKey(node: TreeNode): string {
  const head = `${node.kind}=${node.value ?? ''}/${String(node.children.length)}`;
  return [head, ...node.children.map((child, index) => slotLabel(node, child, index))].join(' ');
}

export function cellAt(table: Int32Array, index: number): number {
  return table[index] ?? 0;
}

export function suffixTable<Item>(
  left: readonly Item[],
  right: readonly Item[],
  cellValue: (grid: Table, i: number, j: number) => number,
): Table {
  const width = right.length + 1;
  const table = new Int32Array((left.length + 1) * width);
  const grid = { table, width };
  const columns = [...right.keys()].toReversed();
  for (const i of [...left.keys()].toReversed()) {
    for (const j of columns) {
      table[i * width + j] = cellValue(grid, i, j);
    }
  }
  return grid;
}

function lcsCell(left: readonly string[], right: readonly string[]) {
  return ({ table, width }: Table, i: number, j: number): number =>
    left[i] === right[j]
      ? cellAt(table, (i + 1) * width + j + 1) + 1
      : Math.max(cellAt(table, (i + 1) * width + j), cellAt(table, i * width + j + 1));
}

function lcsStep(left: readonly string[], right: readonly string[], { table, width }: Table) {
  return ({ i, j }: Cursor): Cursor | undefined => {
    if (i >= left.length || j >= right.length) {
      return undefined;
    }
    if (left[i] === right[j]) {
      return { i: i + 1, j: j + 1 };
    }
    return cellAt(table, (i + 1) * width + j) >= cellAt(table, i * width + j + 1)
      ? { i: i + 1, j }
      : { i, j: j + 1 };
  };
}

function diagonalPairs(left: readonly string[], right: readonly string[]): Pair[] {
  return [...left.keys()]
    .filter((index) => index < right.length && left[index] === right[index])
    .map((index) => [index, index]);
}

function lcsPairs(left: readonly string[], right: readonly string[]): Pair[] {
  if (left.length * right.length > THRESHOLDS.maxListCells) {
    return diagonalPairs(left, right);
  }
  const step = lcsStep(left, right, suffixTable(left, right, lcsCell(left, right)));
  return chainOf({ i: 0, j: 0 }, step)
    .filter(({ i, j }) => i < left.length && j < right.length && left[i] === right[j])
    .map(({ i, j }) => [i, j]);
}

function segmentPairs(
  lists: readonly [readonly TreeNode[], readonly TreeNode[]],
  from: Pair,
  to: Pair,
): Pair[] {
  const [xs, ys] = lists;
  const left = xs.slice(from[0], to[0]).map(coarseKey);
  const right = ys.slice(from[1], to[1]).map(coarseKey);
  return lcsPairs(left, right).map(([i, j]) => [i + from[0], j + from[1]]);
}

function statementPairs(
  xs: readonly TreeNode[],
  ys: readonly TreeNode[],
  cachedKey: KeyCache,
): Pair[] {
  const anchors = lcsPairs(
    xs.map((node) => cachedKey(node, KEY_MODES.exact)),
    ys.map((node) => cachedKey(node, KEY_MODES.exact)),
  );
  const pairs: Pair[] = [];
  let from: Pair = [0, 0];
  for (const anchor of [...anchors, [xs.length, ys.length] as const]) {
    appendAll(pairs, segmentPairs([xs, ys], from, anchor));
    pairs.push(anchor);
    from = [anchor[0] + 1, anchor[1] + 1];
  }
  return pairs;
}

export function alignedSlots(
  xs: readonly TreeNode[],
  ys: readonly TreeNode[],
  cachedKey: KeyCache,
): Slot[] {
  const slots: Slot[] = [];
  let nextLeft = 0;
  let nextRight = 0;
  for (const [left, right] of statementPairs(xs, ys, cachedKey)) {
    appendAll(
      slots,
      xs.slice(nextLeft, left).map((node): Slot => ({ side: 'a', node })),
    );
    appendAll(
      slots,
      ys.slice(nextRight, right).map((node): Slot => ({ side: 'b', node })),
    );
    if (left < xs.length) {
      slots.push({ pair: [present(xs[left]), present(ys[right])] });
    }
    nextLeft = left + 1;
    nextRight = right + 1;
  }
  return slots;
}
