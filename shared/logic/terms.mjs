import { foldTree } from '../traversal.mjs';

const EQUALITY_FLIPS = new Map([
  ['==', '!='],
  ['!=', '=='],
  ['===', '!=='],
  ['!==', '==='],
]);

const STATEMENT_KINDS = new Set([
  'block',
  'if',
  'return',
  'throw',
  'break',
  'continue',
  'expression',
  'declaration',
  'statement',
]);

const COMPARISONS = new Set(['<', '<=', '>', '>=']);
const JUMPS = new Set(['return', 'throw', 'break', 'continue']);

export function term(kind, value, children = []) {
  return { kind, value, children, range: undefined };
}

export function withRange(node, range) {
  return { ...node, range };
}

export function literal(value, range) {
  return withRange(term('literal', value), range);
}

export function not(operand, range = operand.range) {
  return withRange(term('unary', '!', [operand]), range);
}

export function logical(operator, operands, range = operands[0].range) {
  return withRange(term('logical', operator, operands), range);
}

export function withChildren(node, children) {
  return children.every((child, index) => child === node.children[index])
    ? node
    : { ...node, children };
}

export function foldTerm(root, combine) {
  return foldTree(root, undefined, {
    expand: (node) => node.children.map((child) => [child]),
    combine: (node, _context, results) => combine(node, results),
  });
}

export function key(root) {
  return foldTerm(root, (node, children) => {
    const head =
      node.value === undefined ? node.kind : `${node.kind}:${JSON.stringify(node.value)}`;
    return children.length === 0 ? head : `(${head} ${children.join(' ')})`;
  });
}

export function isStatement(node) {
  return STATEMENT_KINDS.has(node.kind);
}

export function isComparison(node) {
  return node?.kind === 'binary' && COMPARISONS.has(node.value);
}

export function isEquality(node) {
  return node?.kind === 'binary' && EQUALITY_FLIPS.has(node.value);
}

export function flippedEquality(operator) {
  return EQUALITY_FLIPS.get(operator);
}

export function isBooleanLiteral(node, value) {
  return (
    node?.kind === 'literal' &&
    (value === undefined ? node.value === 'true' || node.value === 'false' : node.value === value)
  );
}

export function isNot(node) {
  return node?.kind === 'unary' && node.value === '!';
}

export function isLogical(node, operator) {
  return node?.kind === 'logical' && node.value === operator;
}

export function isBooleanValued(root) {
  return foldTerm(root, (node, children) => {
    if (node.boolean === true || isBooleanLiteral(node) || isNot(node)) {
      return true;
    }
    if (isComparison(node) || isEquality(node)) {
      return true;
    }
    if (isLogical(node, '&&') || isLogical(node, '||')) {
      return children.every(Boolean);
    }
    return node.kind === 'conditional' && children[1] && children[2];
  });
}

export function endsInJump(block) {
  const last = block.children.at(-1);
  return last !== undefined && JUMPS.has(last.kind);
}
