import { foldTree } from '../../traversal.mts';
import { cannotThrow, isSideEffectFree } from '../purity.mts';
import { isEquality, key, logical, term, withRange } from '../terms.mts';
import { operatorPairOf, pairOf } from '../typed/term-parts.mts';
import type { ExpressionRewrite, RewriteContext, Term } from '../typed/term-types.mts';

const ORIENTED = new Map<string | undefined, string>([
  ['>', '<'],
  ['>=', '<='],
]);

const BITWISE = new Set<string | undefined>(['&', '|', '^']);

function isCommutative(node: Term): boolean {
  return isEquality(node) || (node.kind === 'binary' && BITWISE.has(node.value));
}

function comparisonOrientation(node: Term): Term | undefined {
  const operands = operatorPairOf(node, ORIENTED);
  if (operands === undefined) {
    return undefined;
  }
  const [left, right] = operands;
  return isSideEffectFree(left) && isSideEffectFree(right)
    ? withRange(term('binary', ORIENTED.get(node.value), [right, left]), node.range)
    : undefined;
}

function operandOrder(node: Term): Term | undefined {
  const operands = pairOf(node);
  if (operands === undefined) {
    return undefined;
  }
  const [left, right] = operands;
  const ordered = isSideEffectFree(left) && isSideEffectFree(right) && key(left) > key(right);
  return ordered ? withRange(term('binary', node.value, [right, left]), node.range) : undefined;
}

function chainOrder(node: Term): Term | undefined {
  const operands = chainOperands(node);
  if (!operands.every((operand) => cannotThrow(operand) && isSideEffectFree(operand))) {
    return undefined;
  }
  const keyed = operands.map((operand) => ({ operand, key: key(operand) }));
  const sorted = keyed.toSorted((a, b) => compareKeys(a.key, b.key));
  if (sorted.every((entry, index) => entry.key === keyed[index]?.key)) {
    return undefined;
  }
  const [first, ...rest] = sorted.map((entry) => entry.operand);
  if (first === undefined) {
    return undefined;
  }
  return rest.reduce((chain, operand) => logical(node.value, [chain, operand], node.range), first);
}

function commutativeOrder(node: Term, context: RewriteContext): Term | undefined {
  if (node.kind === 'binary') {
    return isCommutative(node) ? operandOrder(node) : undefined;
  }
  const isTruthChain = node.kind === 'logical' && node.value !== '??' && context.booleanContext;
  return isTruthChain ? chainOrder(node) : undefined;
}

function logicalGrouping(node: Term): Term | undefined {
  const [left, right] = node.children;
  if (node.kind !== 'logical' || right?.kind !== 'logical' || right.value !== node.value) {
    return undefined;
  }
  const rest = pairOf(right);
  if (left === undefined || rest === undefined) {
    return undefined;
  }
  const [middle, last] = rest;
  const grouped = logical(node.value, [left, middle], node.range);
  return logical(node.value, [grouped, last], node.range);
}

function isInChain(node: Term, operator: string | undefined): boolean {
  return node.kind === 'logical' && node.value === operator;
}

function chainOperands(chain: Term): Term[] {
  return foldTree(chain, chain.value, {
    expand: (node: Term, operator: string | undefined) =>
      isInChain(node, operator)
        ? node.children.map((child): [Term, string | undefined] => [child, operator])
        : [],
    combine: (node: Term, operator: string | undefined, operands: Term[][]) =>
      isInChain(node, operator) ? operands.flat() : [node],
  });
}

function compareKeys(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export const ORDERING_REWRITES: readonly ExpressionRewrite[] = [
  { name: 'comparison-orientation', rewrite: comparisonOrientation },
  { name: 'logical-grouping', rewrite: logicalGrouping },
  { name: 'commutative-order', rewrite: commutativeOrder },
];
