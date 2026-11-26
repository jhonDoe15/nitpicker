import { leavesRun } from '../canonical/effects.mts';
import { cellAt, suffixTable, type Table } from '../align/lists.mts';
import { alignLists, alignPair } from '../align/align.mts';
import type { Alignment } from '../align/align.mts';
import { createState } from '../align/state.mts';
import { KEY_MODES } from '../tree/keys.mts';
import { blocksOf, present } from '../tree/nodes.mts';
import type { AlignState, KeyCache, TreeNode } from '../tree/tree-types.mts';
import { THRESHOLDS } from '../thresholds/thresholds.mts';
import { valuesUsedAfter } from './after.mts';
import { controlFlowHole } from './whole.mts';

type Pair = readonly [TreeNode, TreeNode];
type BlockSide = { readonly tree: TreeNode; readonly block: TreeNode };
type PlacedSide = BlockSide & { readonly from: number };
type Sides = { readonly left: BlockSide; readonly right: BlockSide; readonly cachedKey: KeyCache };
type Placed = {
  readonly left: PlacedSide;
  readonly right: PlacedSide;
  readonly cachedKey: KeyCache;
};
type Stretch = { readonly i: number; readonly j: number; readonly length: number };
type Window = { readonly offset: number; readonly length: number };
type KeyedBlock = {
  readonly block: TreeNode;
  readonly keys: readonly number[];
  readonly present: ReadonlySet<number>;
};
type RunMatch = Alignment & { readonly statements: readonly [TreeNode[], TreeNode[]] };

function* cells<Row, Column>(
  rows: Iterable<Row>,
  columns: Iterable<Column>,
): Generator<[Row, Column]> {
  for (const i of rows) {
    for (const j of columns) {
      yield [i, j];
    }
  }
}

function runLengths(left: readonly number[], right: readonly number[]): Table {
  return suffixTable(left, right, ({ table, width }, i, j) =>
    left[i] === right[j] ? cellAt(table, (i + 1) * width + j + 1) + 1 : 0,
  );
}

function commonStretches(leftBlock: KeyedBlock, rightBlock: KeyedBlock): Stretch[] {
  const [left, right] = [leftBlock.keys, rightBlock.keys];
  if (
    left.length * right.length > THRESHOLDS.maxListCells ||
    !left.some((key) => rightBlock.present.has(key))
  ) {
    return [];
  }
  const { table, width } = runLengths(left, right);
  const stretches: Stretch[] = [];
  const columns = [...right.keys()];
  for (const [i, j] of cells(left.keys(), columns)) {
    const length = cellAt(table, i * width + j);
    const maximal = i === 0 || j === 0 || left[i - 1] !== right[j - 1];
    if (maximal && length >= THRESHOLDS.minRunStatements) {
      stretches.push({ i, j, length: Math.min(length, THRESHOLDS.maxRunWindow) });
    }
  }
  return stretches;
}

function acceptable(side: PlacedSide, statements: readonly TreeNode[]): boolean {
  return valuesUsedAfter(side.tree, side.block, statements) <= THRESHOLDS.maxValuesAfterRun;
}

function sideStatements(side: PlacedSide, { offset, length }: Window): TreeNode[] {
  return side.block.children.slice(side.from + offset, side.from + offset + length);
}

function broken(state: AlignState): boolean {
  return (
    state.conflicts > 0 ||
    state.gaps.length > 0 ||
    state.holes.length > THRESHOLDS.maxParameters ||
    controlFlowHole(state.holes)
  );
}

function tryWindow({ left, right, cachedKey }: Placed, window: Window): RunMatch | undefined {
  const xs = sideStatements(left, window);
  const ys = sideStatements(right, window);
  if (!(acceptable(left, xs) && acceptable(right, ys))) {
    return undefined;
  }
  const { state, template } = alignLists([xs, ys], cachedKey);
  return broken(state) || state.shared < THRESHOLDS.minRunNodes
    ? undefined
    : { state, template, statements: [xs, ys] };
}

function countUp(from: number, to: number): number[] {
  return Array.from({ length: Math.max(to - from + 1, 0) }, (_, index) => from + index);
}

function alignStatement(state: AlignState, pair: Pair): AlignState {
  alignPair(state, pair);
  return state;
}

function windowsFrom(
  placed: Placed,
  stretch: Stretch,
  offset: number,
): (Window & { readonly shared: number })[] {
  const state = createState(placed.cachedKey);
  const found: (Window & { readonly shared: number })[] = [];
  for (const length of countUp(1, stretch.length - offset)) {
    const window = { offset, length };
    const [xs, ys] = [sideStatements(placed.left, window), sideStatements(placed.right, window)];
    const pair: Pair = [present(xs.at(-1)), present(ys.at(-1))];
    if (leavesRun([pair[0]]) || leavesRun([pair[1]]) || broken(alignStatement(state, pair))) {
      break;
    }
    if (length >= THRESHOLDS.minRunStatements && state.shared >= THRESHOLDS.minRunNodes) {
      found.push({ ...window, shared: state.shared });
    }
  }
  return found;
}

function byShared(
  left: Window & { readonly shared: number },
  right: Window & { readonly shared: number },
): number {
  return right.shared - left.shared || right.length - left.length || left.offset - right.offset;
}

function bestWindow(sides: Sides, stretch: Stretch): RunMatch | undefined {
  const placed: Placed = {
    ...sides,
    left: { ...sides.left, from: stretch.i },
    right: { ...sides.right, from: stretch.j },
  };
  const candidates = countUp(0, stretch.length - THRESHOLDS.minRunStatements)
    .flatMap((offset) => windowsFrom(placed, stretch, offset))
    .sort(byShared);
  for (const window of candidates) {
    const found = tryWindow(placed, window);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function blockKeys(tree: TreeNode, cachedKey: KeyCache, ids: Map<string, number>): KeyedBlock[] {
  return blocksOf(tree).map((block) => {
    const keys = block.children.map((statement) => {
      const key = cachedKey(statement, KEY_MODES.abstract);
      const id = ids.get(key) ?? ids.size;
      ids.set(key, id);
      return id;
    });
    return { block, keys, present: new Set(keys) };
  });
}

function blockPairs(trees: Pair, cachedKey: KeyCache): Generator<[KeyedBlock, KeyedBlock]> {
  const ids = new Map<string, number>();
  return cells(blockKeys(trees[0], cachedKey, ids), blockKeys(trees[1], cachedKey, ids));
}

function runsBetween(
  trees: Pair,
  [left, right]: readonly [KeyedBlock, KeyedBlock],
  cachedKey: KeyCache,
): RunMatch[] {
  const sides: Sides = {
    left: { tree: trees[0], block: left.block },
    right: { tree: trees[1], block: right.block },
    cachedKey,
  };
  return commonStretches(left, right)
    .map((stretch) => bestWindow(sides, stretch))
    .filter((found) => found !== undefined);
}

function larger(best: RunMatch | undefined, candidate: RunMatch): RunMatch {
  return best === undefined || candidate.state.shared > best.state.shared ? candidate : best;
}

export function sharedRun(trees: Pair, cachedKey: KeyCache): RunMatch | undefined {
  return [...blockPairs(trees, cachedKey)]
    .flatMap((pair) => runsBetween(trees, pair, cachedKey))
    .reduce<RunMatch | undefined>(larger, undefined);
}
