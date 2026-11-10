import { leavesRun } from '../canonical/effects.mjs';
import { alignLists, alignPair } from '../align/align.mjs';
import { createState } from '../align/state.mjs';
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
  if (left.length * right.length > THRESHOLDS.maxListCells) {
    return [];
  }
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
  return valuesUsedAfter(side.tree, side.block, statements) <= THRESHOLDS.maxValuesAfterRun;
}

function sideStatements(side, { offset, length }) {
  return side.block.children.slice(side.from + offset, side.from + offset + length);
}

function broken(state) {
  return (
    state.conflicts > 0 ||
    state.gaps.length > 0 ||
    state.holes.length > THRESHOLDS.maxParameters ||
    controlFlowHole(state.holes)
  );
}

function tryWindow({ left, right, cachedKey }, window) {
  const xs = sideStatements(left, window);
  const ys = sideStatements(right, window);
  if (!acceptable(left, xs) || !acceptable(right, ys)) {
    return undefined;
  }
  const { state, template } = alignLists([xs, ys], cachedKey);
  return broken(state) || state.shared < THRESHOLDS.minRunNodes
    ? undefined
    : { state, template, statements: [xs, ys] };
}

function countUp(from, to) {
  return Array.from({ length: Math.max(to - from + 1, 0) }, (_, index) => from + index);
}

function alignStatement(state, pair) {
  alignPair(state, pair);
  return state;
}

function windowsFrom(placed, stretch, offset) {
  const state = createState(placed.cachedKey);
  const found = [];
  for (const length of countUp(1, stretch.length - offset)) {
    const window = { offset, length };
    const [xs, ys] = [sideStatements(placed.left, window), sideStatements(placed.right, window)];
    const pair = [xs.at(-1), ys.at(-1)];
    if (leavesRun([pair[0]]) || leavesRun([pair[1]]) || broken(alignStatement(state, pair))) {
      break;
    }
    if (length >= THRESHOLDS.minRunStatements && state.shared >= THRESHOLDS.minRunNodes) {
      found.push({ ...window, shared: state.shared });
    }
  }
  return found;
}

function byShared(left, right) {
  return right.shared - left.shared || right.length - left.length || left.offset - right.offset;
}

function bestWindow(sides, stretch) {
  const placed = {
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
