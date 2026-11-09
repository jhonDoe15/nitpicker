import { leavesRun } from '../canonical/effects.mjs';
import { alignLists } from '../align/align.mjs';
import { KEY_MODES } from '../tree/keys.mjs';
import { blocksOf } from '../tree/nodes.mjs';
import { THRESHOLDS } from '../thresholds.mjs';
import { valuesUsedAfter } from './after.mjs';
import { controlFlowHole } from './whole.mjs';

function* cells(rows, columns) {
  for (const i of rows) {
    for (const j of columns) {
      yield [i, j];
    }
  }
}

function runLengths(left, right) {
  const width = right.length + 1;
  const table = new Int32Array((left.length + 1) * width);
  for (const [i, j] of cells([...left.keys()].toReversed(), [...right.keys()].toReversed())) {
    table[i * width + j] = left[i] === right[j] ? table[(i + 1) * width + j + 1] + 1 : 0;
  }
  return { table, width };
}

function commonStretches(left, right) {
  const { table, width } = runLengths(left, right);
  const stretches = [];
  for (const [i, j] of cells([...left.keys()], [...right.keys()])) {
    const length = table[i * width + j];
    const maximal = i === 0 || j === 0 || left[i - 1] !== right[j - 1];
    if (maximal && length >= THRESHOLDS.minRunStatements) {
      stretches.push({ i, j, length: Math.min(length, THRESHOLDS.maxRunWindow) });
    }
  }
  return stretches;
}

function acceptable(side, statements) {
  return (
    !leavesRun(statements) &&
    valuesUsedAfter(side.tree, side.block, statements) <= THRESHOLDS.maxValuesAfterRun
  );
}

function tryWindow({ left, right, cachedKey }, { offset, length }) {
  const xs = left.block.children.slice(left.from + offset, left.from + offset + length);
  const ys = right.block.children.slice(right.from + offset, right.from + offset + length);
  const { state, template } = alignLists([xs, ys], cachedKey);
  const passes =
    state.conflicts === 0 &&
    state.gaps.length === 0 &&
    state.holes.length <= THRESHOLDS.maxParameters &&
    state.shared >= THRESHOLDS.minRunNodes &&
    !controlFlowHole(state.holes) &&
    acceptable(left, xs) &&
    acceptable(right, ys);
  return passes ? { state, template, statements: [xs, ys] } : undefined;
}

function countDown(from, to) {
  return Array.from({ length: from - to + 1 }, (_, index) => from - index);
}

function* windows(length) {
  for (const size of countDown(length, THRESHOLDS.minRunStatements)) {
    for (const offset of countDown(length - size, 0).toReversed()) {
      yield { offset, length: size };
    }
  }
}

function bestWindow(sides, stretch) {
  const placed = {
    ...sides,
    left: { ...sides.left, from: stretch.i },
    right: { ...sides.right, from: stretch.j },
  };
  for (const window of windows(stretch.length)) {
    const found = tryWindow(placed, window);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function blockKeys(tree, cachedKey) {
  return blocksOf(tree).map((block) => ({
    block,
    keys: block.children.map((statement) => cachedKey(statement, KEY_MODES.abstract)),
  }));
}

function blockPairs(trees, cachedKey) {
  return cells(blockKeys(trees[0], cachedKey), blockKeys(trees[1], cachedKey));
}

function runsBetween(trees, [left, right], cachedKey) {
  const sides = {
    left: { tree: trees[0], block: left.block },
    right: { tree: trees[1], block: right.block },
    cachedKey,
  };
  return commonStretches(left.keys, right.keys)
    .map((stretch) => bestWindow(sides, stretch))
    .filter((found) => found !== undefined);
}

function larger(best, candidate) {
  return best === undefined || candidate.state.shared > best.state.shared ? candidate : best;
}

export function sharedRun(trees, cachedKey) {
  return [...blockPairs(trees, cachedKey)]
    .flatMap((pair) => runsBetween(trees, pair, cachedKey))
    .reduce(larger, undefined);
}
