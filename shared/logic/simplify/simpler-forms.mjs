import { normalize } from '../normalize.mjs';
import { print } from '../print.mjs';
import { key, term, withChildren } from '../terms.mjs';
import { factorNegations } from './negation-factoring.mjs';
import { sameRange, SIMPLER_REWRITES } from './simpler-rewrites.mjs';

const MAX_ROUNDS = 20;
const ROUNDS = Array.from({ length: MAX_ROUNDS }, (_, index) => index);
const ELIDED = term('block', undefined, [term('statement', '…')]);

function simplify(node, booleanContext) {
  const rewrites = [];
  let current = node;
  ROUNDS.some(() => {
    const normal = normalize(current, { booleanContext, rewrites: SIMPLER_REWRITES });
    const factored = factorNegations(normal.term);
    rewrites.push(...normal.rewrites, ...factored.rewrites);
    current = factored.term;
    return factored.rewrites.length === 0;
  });
  return { term: current, rewrites };
}

function samePlaces(before, after) {
  return (
    before.kind === after.kind &&
    before.value === after.value &&
    before.children.length === after.children.length &&
    before.children.every((child, index) => sameRange(child.range, after.children[index].range))
  );
}

function blockPairs(before, after, found) {
  return after.children.flatMap((child) => {
    const match = before.children.find(({ range }) => sameRange(range, child.range));
    if (match === undefined) {
      found.push(child);
      return [];
    }
    return [[match, child]];
  });
}

function nextPairs(left, right, found) {
  if (left.kind === 'block' && right.kind === 'block') {
    return blockPairs(left, right, found);
  }
  if (samePlaces(left, right)) {
    return left.children.map((child, index) => [child, right.children[index]]);
  }
  found.push(right);
  return [];
}

function differences(before, after) {
  const found = [];
  const pending = [[before, after]];
  for (const [left, right] of pending) {
    if (key(left) !== key(right)) {
      pending.push(...nextPairs(left, right, found));
    }
  }
  return found;
}

function compact(node) {
  return node.kind === 'if'
    ? withChildren(
        node,
        node.children.map((child) => (child.kind === 'block' ? ELIDED : child)),
      )
    : node;
}

/**
 * Each part of `root` that has a strictly simpler exact form: its range, the printed form, and
 * whether its branches swap.
 */
export function simplerForms(root, { booleanContext = false } = {}) {
  const { term: simpler, rewrites } = simplify(root, booleanContext);
  return differences(root, simpler).map((node) => ({
    range: node.range,
    form: print(compact(node)),
    swapped: rewrites.some(
      ({ rewrite, range }) => rewrite === 'negated-condition' && sameRange(range, node.range),
    ),
  }));
}
