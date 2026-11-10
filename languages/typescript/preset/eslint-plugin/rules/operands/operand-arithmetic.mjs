import { key } from '../../../../../../shared/logic/terms.mjs';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { toTerm } from '../analysis/logic/estree-terms.mjs';
import { isEffectFree, isStable } from './operand-terms.mjs';

const ERASING = new Set(['*', '&']);
const REASSOCIATED = new Set(['+', '-', '*', '/', '%', '&', '|', '^', '**', '<<', '>>', '>>>']);
const COMMUTATIVE = new Set(['+', '*', '&', '|', '^', '&&', '||', '??']);
const LOGICAL = new Set(['&&', '||', '??']);
const ZEROS = new Set(['0', '0n']);
const PLAIN = new Set(['Identifier', 'MemberExpression', 'ThisExpression']);

function isZeroTerm(term) {
  return term.kind === 'literal' && ZEROS.has(term.value);
}

function isConstantTerm(term) {
  const inner = term.kind === 'unary' ? term.children[0] : term;
  return inner.kind === 'literal';
}

function shown(node, sourceCode) {
  const text = sourceCode.getText(node);
  return PLAIN.has(node.type) ? text : `(${text})`;
}

export function erasingReport(node, sourceCode) {
  if (!ERASING.has(node.operator)) {
    return undefined;
  }
  const sides = [node.left, node.right].map((side) => ({ side, term: toTerm(side, sourceCode) }));
  const erased = sides.some(({ term }) => isZeroTerm(term));
  const operand = sides.find(({ term }) => !isZeroTerm(term));
  const isErasable =
    operand !== undefined && !isConstantTerm(operand.term) && isEffectFree(operand.term);
  if (!(erased && isErasable)) {
    return undefined;
  }
  const data = { operand: shown(operand.side, sourceCode), operator: node.operator };
  return { node, messageId: 'erasingOperation', data };
}

function isChainOf(node, operator) {
  const type = LOGICAL.has(operator) ? 'LogicalExpression' : 'BinaryExpression';
  return node.type === type && node.operator === operator;
}

function chainOperands(right, operator) {
  const lefts = chainOf(right, (node) => (isChainOf(node, operator) ? node.left : undefined));
  const leftmost = lefts.at(-1);
  if (!COMMUTATIVE.has(operator)) {
    return [leftmost];
  }
  return [
    leftmost,
    ...lefts.filter((node) => isChainOf(node, operator)).map(({ right: side }) => side),
  ];
}

function isRepeatedTarget(node, operator, sourceCode) {
  const target = toTerm(node.left, sourceCode);
  if (!isStable(target)) {
    return false;
  }
  const targetKey = key(target);
  return chainOperands(node.right, operator).some(
    (side) => key(toTerm(side, sourceCode)) === targetKey,
  );
}

export function assignmentReport(node, sourceCode) {
  const operator = node.operator.slice(0, -1);
  const isCompound = REASSOCIATED.has(operator) || LOGICAL.has(operator);
  if (!(isCompound && isChainOf(node.right, operator))) {
    return undefined;
  }
  if (!isRepeatedTarget(node, operator, sourceCode)) {
    return undefined;
  }
  const data = { target: sourceCode.getText(node.left), operator };
  return { node, messageId: 'misrefactoredAssignment', data };
}
