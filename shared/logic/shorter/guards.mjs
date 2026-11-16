import { pureCallKind, isSideEffectFree } from '../purity.mjs';
import { foldTerm, isBooleanValued, key } from '../terms.mjs';
import { leavesOf } from './skeleton.mjs';

const MAX_ATOMS = 6;
const MAX_LEAVES = 12;
const FAILING_OPERATORS = new Set(['/', '%', '**', '<<', '>>', '>>>']);
const ARITHMETIC_ATOM = /[/%]|\*\*|<<|>>/u;

function keysIn(root) {
  return foldTerm(
    root,
    (node, children) => new Set([key(node), ...children.flatMap((set) => [...set])]),
  );
}

function isStaticCall(call) {
  return call.children[0].kind === 'member' && pureCallKind(call.children[0]) === 'static';
}

function isConstant(node) {
  return node.kind === 'literal' || node.kind === 'this';
}

function callBases(call) {
  const [callee, ...args] = call.children;
  if (isStaticCall(call)) {
    return [];
  }
  return [callee.children[0], ...args];
}

function basesOf(root) {
  return foldTerm(root, (node, children) => {
    const below = children.flat();
    if (node.kind === 'member') {
      return [...below, node.children[0]];
    }
    if (node.kind === 'index') {
      return [...below, ...node.children];
    }
    return node.kind === 'call' ? [...below, ...callBases(node)] : below;
  }).filter((base) => !isConstant(base));
}

function mayFail(root) {
  return foldTerm(root, (node, children) => {
    const own =
      (node.kind === 'binary' && FAILING_OPERATORS.has(node.value)) ||
      (node.kind === 'name' &&
        node.value.startsWith('#value ') &&
        ARITHMETIC_ATOM.test(node.value));
    return own || children.some(Boolean);
  });
}

function earliestMention(facts, index, base) {
  const wanted = key(base);
  return facts.slice(0, index).findIndex((fact) => fact.keys.has(wanted));
}

function pinOf(facts, index, base) {
  const earlier = earliestMention(facts, index, base);
  if (earlier < 0 && index > 0) {
    return undefined;
  }
  return earlier < 0 ? index : earlier;
}

function pinsFor(facts) {
  const pins = facts.flatMap((fact, index) =>
    [...fact.bases].map((base) => pinOf(facts, index, base)),
  );
  return pins.includes(undefined) ? undefined : new Set(pins);
}

/**
 * What may be changed in the condition `skeleton`: its leaves in evaluation order and the leaves that
 * stay where they are because they guard a later one (a null check before a member read, bounds before
 * an index), or `undefined` when it must not be touched: an operand with an effect or that may fail
 * without a guard, more than 6 distinct atoms, or a value that is not a boolean.
 */
export function guardedLeaves(
  skeleton,
  { booleanContext, isPinned = () => false, isBoolean: isBooleanLeaf = () => false },
) {
  const leaves = leavesOf(skeleton);
  const atoms = new Set(leaves.map(({ term }) => key(term)));
  const isSafe = leaves.every(
    ({ term }) => term.kind !== 'literal' && isSideEffectFree(term) && !mayFail(term),
  );
  const isValueSafe =
    booleanContext || leaves.every((leaf) => isBooleanValued(leaf.term) || isBooleanLeaf(leaf));
  if (!isSafe || !isValueSafe || atoms.size > MAX_ATOMS || leaves.length > MAX_LEAVES) {
    return undefined;
  }
  const facts = leaves.map(({ term }) => ({ keys: keysIn(term), bases: basesOf(term) }));
  const pinned = pinsFor(facts);
  if (pinned === undefined) {
    return undefined;
  }
  const kept = new Set(leaves.filter((leaf, index) => pinned.has(index) || isPinned(leaf, leaves)));
  return {
    leaves,
    pinned: kept,
    throwers: new Set(leaves.filter((_leaf, index) => facts[index].bases.length > 0)),
  };
}
