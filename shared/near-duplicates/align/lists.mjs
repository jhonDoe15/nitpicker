import { chainOf } from '../../traversal.mjs';
import { THRESHOLDS } from '../thresholds.mjs';
import { KEY_MODES } from '../tree/keys.mjs';
import { appendAll, categoryOf, isTypeSlot } from '../tree/nodes.mjs';

function slotLabel(node, child, index) {
  if (isTypeSlot(node, index)) {
    return 'type';
  }
  return categoryOf(child) === 'expression' && node.kind !== 'evaluate' ? 'expression' : child.kind;
}

export function coarseKey(node) {
  const head = `${node.kind}=${node.value ?? ''}/${node.children.length}`;
  return [head, ...node.children.map((child, index) => slotLabel(node, child, index))].join(' ');
}

function suffixTable(left, right) {
  const width = right.length + 1;
  const table = new Int32Array((left.length + 1) * width);
  const columns = [...right.keys()].toReversed();
  for (const i of [...left.keys()].toReversed()) {
    for (const j of columns) {
      table[i * width + j] =
        left[i] === right[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return { table, width };
}

function lcsStep(left, right, { table, width }) {
  return ({ i, j }) => {
    if (i >= left.length || j >= right.length) {
      return undefined;
    }
    if (left[i] === right[j]) {
      return { i: i + 1, j: j + 1 };
    }
    return table[(i + 1) * width + j] >= table[i * width + j + 1]
      ? { i: i + 1, j }
      : { i, j: j + 1 };
  };
}

function diagonalPairs(left, right) {
  return [...left.keys()]
    .filter((index) => index < right.length && left[index] === right[index])
    .map((index) => [index, index]);
}

function lcsPairs(left, right) {
  if (left.length * right.length > THRESHOLDS.maxListCells) {
    return diagonalPairs(left, right);
  }
  const step = lcsStep(left, right, suffixTable(left, right));
  return chainOf({ i: 0, j: 0 }, step)
    .filter(({ i, j }) => i < left.length && j < right.length && left[i] === right[j])
    .map(({ i, j }) => [i, j]);
}

function segmentPairs(lists, from, to) {
  const [xs, ys] = lists;
  const left = xs.slice(from[0], to[0]).map(coarseKey);
  const right = ys.slice(from[1], to[1]).map(coarseKey);
  return lcsPairs(left, right).map(([i, j]) => [i + from[0], j + from[1]]);
}

function statementPairs(xs, ys, cachedKey) {
  const anchors = lcsPairs(
    xs.map((node) => cachedKey(node, KEY_MODES.exact)),
    ys.map((node) => cachedKey(node, KEY_MODES.exact)),
  );
  const pairs = [];
  let from = [0, 0];
  for (const anchor of [...anchors, [xs.length, ys.length]]) {
    appendAll(pairs, segmentPairs([xs, ys], from, anchor));
    pairs.push(anchor);
    from = [anchor[0] + 1, anchor[1] + 1];
  }
  return pairs;
}

export function alignedSlots(xs, ys, cachedKey) {
  const slots = [];
  const next = [0, 0];
  for (const [left, right] of statementPairs(xs, ys, cachedKey)) {
    appendAll(
      slots,
      xs.slice(next[0], left).map((node) => ({ side: 'a', node })),
    );
    appendAll(
      slots,
      ys.slice(next[1], right).map((node) => ({ side: 'b', node })),
    );
    if (left < xs.length) {
      slots.push({ pair: [xs[left], ys[right]] });
    }
    next[0] = left + 1;
    next[1] = right + 1;
  }
  return slots;
}
