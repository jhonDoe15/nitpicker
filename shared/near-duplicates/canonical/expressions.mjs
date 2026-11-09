import { depthFirst } from '../../traversal.mjs';
import { compareText, keyOf } from '../tree/keys.mjs';
import { make, rebuild, withChildren } from '../tree/nodes.mjs';
import { isPure } from './effects.mjs';

const EQUALITY = new Set(['==', '!=', '===', '!==']);
const BITWISE = new Set(['&', '|', '^']);
const LOGICAL = new Set(['&&', '||']);
const ARITHMETIC = new Set(['+', '*']);
const CONDITION_POSITIONS = { if: 0, while: 0, do: 1, for: 1, conditional: 0 };

function shapeOrder(mode) {
  return (left, right) => compareText(keyOf(left, mode), keyOf(right, mode));
}

function sameOperator(node, current) {
  return current.kind === 'binary' && current.value === node.value;
}

function operandsOf(node) {
  return [
    ...depthFirst(node, (current) => (sameOperator(node, current) ? current.children : [])),
  ].filter((current) => !sameOperator(node, current));
}

function chain(node, { sortable, mode }) {
  const operands = operandsOf(node);
  if (sortable && operands.every(isPure)) {
    operands.sort(shapeOrder(mode));
  }
  return operands
    .slice(1)
    .reduce((left, right) =>
      make('binary', [left, right], { value: node.value, commutes: node.commutes }),
    );
}

function swapped(node, mode) {
  const [left, right] = node.children;
  if (isPure(left) && isPure(right) && shapeOrder(mode)(left, right) > 0) {
    return withChildren(node, [right, left]);
  }
  return node;
}

function binary(node, mode) {
  if (LOGICAL.has(node.value)) {
    return chain(node, { sortable: node.commutes === true, mode });
  }
  if (BITWISE.has(node.value)) {
    return chain(node, { sortable: true, mode });
  }
  if (EQUALITY.has(node.value) || (ARITHMETIC.has(node.value) && node.commutes === true)) {
    return swapped(node, mode);
  }
  return node;
}

export function negationOf(node) {
  return node.kind === 'unary' && node.value === '!' ? node.children[0] : undefined;
}

export function rewriteExpression(node, mode) {
  if (node.kind === 'binary') {
    return binary(node, mode);
  }
  const negated = node.kind === 'conditional' ? negationOf(node.children[0]) : undefined;
  if (negated === undefined) {
    return node;
  }
  const [, whenTrue, whenFalse] = node.children;
  return withChildren(node, [negated, whenFalse, whenTrue]);
}

function asCondition(root) {
  return rebuild(root, (node, children) => {
    if (node.kind === 'binary' && LOGICAL.has(node.value)) {
      return { ...node, commutes: true, children };
    }
    return negationOf(node) === undefined ? node : withChildren(node, children);
  });
}

export function withConditions(node, children) {
  const position = CONDITION_POSITIONS[node.kind];
  if (position === undefined) {
    return withChildren(node, children);
  }
  return withChildren(
    node,
    children.map((child, index) => (index === position ? asCondition(child) : child)),
  );
}

export function markConditions(root) {
  return rebuild(root, withConditions);
}
