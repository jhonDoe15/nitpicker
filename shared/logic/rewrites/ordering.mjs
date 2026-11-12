import { foldTree } from '../../traversal.mjs';
import { cannotThrow, isSideEffectFree } from '../purity.mjs';
import { isEquality, key, logical, term, withRange } from '../terms.mjs';

const ORIENTED = new Map([
  ['>', '<'],
  ['>=', '<='],
]);

const BITWISE = new Set(['&', '|', '^']);

function isCommutative(node) {
  return isEquality(node) || (node.kind === 'binary' && BITWISE.has(node.value));
}

function comparisonOrientation(node) {
  if (node.kind !== 'binary' || !ORIENTED.has(node.value)) {
    return undefined;
  }
  const [left, right] = node.children;
  return isSideEffectFree(left) && isSideEffectFree(right)
    ? withRange(term('binary', ORIENTED.get(node.value), [right, left]), node.range)
    : undefined;
}

function operandOrder(node) {
  const [left, right] = node.children;
  const ordered = isSideEffectFree(left) && isSideEffectFree(right) && key(left) > key(right);
  return ordered ? withRange(term('binary', node.value, [right, left]), node.range) : undefined;
}

function chainOrder(node) {
  const operands = chainOperands(node);
  if (!operands.every((operand) => cannotThrow(operand) && isSideEffectFree(operand))) {
    return undefined;
  }
  const keyed = operands.map((operand) => ({ operand, key: key(operand) }));
  const sorted = keyed.toSorted((a, b) => compareKeys(a.key, b.key));
  if (sorted.every((entry, index) => entry.key === keyed[index].key)) {
    return undefined;
  }
  const [first, ...rest] = sorted.map((entry) => entry.operand);
  return rest.reduce((chain, operand) => logical(node.value, [chain, operand], node.range), first);
}

function commutativeOrder(node, context) {
  if (node.kind === 'binary') {
    return isCommutative(node) ? operandOrder(node) : undefined;
  }
  const isTruthChain = node.kind === 'logical' && node.value !== '??' && context.booleanContext;
  return isTruthChain ? chainOrder(node) : undefined;
}

function logicalGrouping(node) {
  const right = node.children[1];
  if (node.kind !== 'logical' || right?.kind !== 'logical' || right.value !== node.value) {
    return undefined;
  }
  const [middle, last] = right.children;
  const grouped = logical(node.value, [node.children[0], middle], node.range);
  return logical(node.value, [grouped, last], node.range);
}

function isInChain(node, operator) {
  return node.kind === 'logical' && node.value === operator;
}

function chainOperands(chain) {
  return foldTree(chain, chain.value, {
    expand: (node, operator) =>
      isInChain(node, operator) ? node.children.map((child) => [child, operator]) : [],
    combine: (node, operator, operands) => (isInChain(node, operator) ? operands.flat() : [node]),
  });
}

function compareKeys(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export const ORDERING_REWRITES = [
  { name: 'comparison-orientation', rewrite: comparisonOrientation },
  { name: 'logical-grouping', rewrite: logicalGrouping },
  { name: 'commutative-order', rewrite: commutativeOrder },
];
