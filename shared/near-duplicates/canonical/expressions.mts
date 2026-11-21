import { depthFirst } from '../../traversal.mts';
import { compareText, keyOf } from '../tree/keys.mts';
import { isOneOf, make, nodesOf, present, rebuild, withChildren } from '../tree/nodes.mts';
import type { KeyMode, TreeNode } from '../tree/tree-types.mts';
import { isPure } from './effects.mts';
import { asReference, collapsedNegation, libraryMatch, sameReference } from './library.mts';

const EQUALITY = new Set(['==', '!=', '===', '!==']);
const BITWISE = new Set(['&', '|', '^']);
const LOGICAL = new Set(['&&', '||']);
const ARITHMETIC = new Set(['+', '*']);
const CONDITION_POSITIONS: Readonly<Record<string, number>> = {
  if: 0,
  while: 0,
  do: 1,
  for: 1,
  conditional: 0,
};

function shapeOrder(mode: KeyMode): (left: TreeNode, right: TreeNode) => number {
  return (left, right) => compareText(keyOf(left, mode), keyOf(right, mode));
}

function sameOperator(node: TreeNode, current: TreeNode): boolean {
  return current.kind === 'binary' && current.value === node.value;
}

function operandsOf(node: TreeNode): TreeNode[] {
  return [
    ...depthFirst(node, (current) => (sameOperator(node, current) ? current.children : [])),
  ].filter((current) => !sameOperator(node, current));
}

function chain(
  node: TreeNode,
  { sortable, mode }: { readonly sortable: boolean; readonly mode: KeyMode },
): TreeNode {
  const operands = operandsOf(node);
  if (sortable && operands.every(isPure)) {
    operands.sort(shapeOrder(mode));
  }
  return operands.reduce((left, right) =>
    make('binary', [left, right], { value: node.value, commutes: node.commutes }),
  );
}

function swapped(node: TreeNode, mode: KeyMode): TreeNode {
  const left = present(node.children[0]);
  const right = present(node.children[1]);
  if (isPure(left) && isPure(right) && shapeOrder(mode)(left, right) > 0) {
    return withChildren(node, [right, left]);
  }
  return node;
}

function binary(node: TreeNode, mode: KeyMode): TreeNode {
  if (isOneOf(LOGICAL, node.value)) {
    return chain(node, { sortable: node.commutes === true, mode });
  }
  if (isOneOf(BITWISE, node.value)) {
    return chain(node, { sortable: true, mode });
  }
  if (
    isOneOf(EQUALITY, node.value) ||
    (isOneOf(ARITHMETIC, node.value) && node.commutes === true)
  ) {
    return swapped(node, mode);
  }
  return node;
}

export function chainInteriors(root: TreeNode): Set<TreeNode> {
  return new Set(
    nodesOf(root).flatMap((node) =>
      node.kind === 'binary' && (isOneOf(LOGICAL, node.value) || isOneOf(BITWISE, node.value))
        ? node.children.filter((child) => sameOperator(node, child))
        : [],
    ),
  );
}

export function negationOf(node: TreeNode): TreeNode | undefined {
  return node.kind === 'unary' && node.value === '!' ? node.children[0] : undefined;
}

export function rewriteExpression(node: TreeNode, mode: KeyMode): TreeNode {
  if (node.kind === 'binary') {
    return binary(node, mode);
  }
  const library =
    libraryMatch(node) ?? asReference(node) ?? sameReference(node) ?? collapsedNegation(node);
  if (library !== undefined) {
    return library;
  }
  const first = node.children[0];
  const negated =
    node.kind === 'conditional' && first !== undefined ? negationOf(first) : undefined;
  if (negated === undefined) {
    return node;
  }
  const whenTrue = present(node.children[1]);
  const whenFalse = present(node.children[2]);
  return withChildren(node, [negated, whenFalse, whenTrue]);
}

function asCondition(root: TreeNode): TreeNode {
  return rebuild(root, (node, children) => {
    if (node.kind === 'binary' && isOneOf(LOGICAL, node.value)) {
      return { ...node, commutes: true, children };
    }
    return negationOf(node) === undefined ? node : withChildren(node, children);
  });
}

export function withConditions(node: TreeNode, children: readonly TreeNode[]): TreeNode {
  const position = CONDITION_POSITIONS[node.kind];
  if (position === undefined) {
    return withChildren(node, children);
  }
  return withChildren(
    node,
    children.map((child, index) => (index === position ? asCondition(child) : child)),
  );
}

export function markConditions(root: TreeNode): TreeNode {
  return rebuild(root, withConditions);
}
