import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { toTerm, type Term } from '../analysis/logic/estree-terms.mts';
import { key } from '../analysis/logic/term-views.mts';
import { chainOf, type SourceCode } from '../typed/node-views.mts';
import { isEffectFree, isStable } from './operand-terms.mts';

type Text = Pick<SourceCode, 'getText'>;
type Binary = TSESTree.BinaryExpression | TSESTree.LogicalExpression;

const ERASING = new Set<string>(['*', '&']);
const REASSOCIATED = new Set<string>([
  '+',
  '-',
  '*',
  '/',
  '%',
  '&',
  '|',
  '^',
  '**',
  '<<',
  '>>',
  '>>>',
]);
const COMMUTATIVE = new Set<string>(['+', '*', '&', '|', '^', '&&', '||', '??']);
const LOGICAL = new Set<string>(['&&', '||', '??']);
const ZEROS = new Set<string>(['0', '0n']);
const PLAIN = new Set<string>(['Identifier', 'MemberExpression', 'ThisExpression']);

function isZeroTerm(term: Term): boolean {
  return term.kind === 'literal' && ZEROS.has(term.value ?? '');
}

function isConstantTerm(term: Term): boolean {
  const inner = term.kind === 'unary' ? term.children[0] : term;
  return inner?.kind === 'literal';
}

function shown(node: TSESTree.Node, sourceCode: Text): string {
  const text = sourceCode.getText(node);
  return PLAIN.has(node.type) ? text : `(${text})`;
}

export function erasingReport(
  node: TSESTree.BinaryExpression,
  sourceCode: Text,
): TSESLint.ReportDescriptor<'erasingOperation'> | undefined {
  if (!ERASING.has(node.operator)) {
    return undefined;
  }
  const sides = [node.left, node.right].map((side) => ({ side, term: toTerm(side, sourceCode) }));
  const erased = sides.some(({ term }) => isZeroTerm(term));
  const operand = sides.find(({ term }) => !isZeroTerm(term));
  if (
    !erased ||
    operand === undefined ||
    isConstantTerm(operand.term) ||
    !isEffectFree(operand.term)
  ) {
    return undefined;
  }
  const data = { operand: shown(operand.side, sourceCode), operator: node.operator };
  return { node, messageId: 'erasingOperation', data };
}

function isChainOf(node: TSESTree.Node, operator: string): node is Binary {
  const type = LOGICAL.has(operator)
    ? AST_NODE_TYPES.LogicalExpression
    : AST_NODE_TYPES.BinaryExpression;
  return (
    (node.type === AST_NODE_TYPES.LogicalExpression ||
      node.type === AST_NODE_TYPES.BinaryExpression) &&
    node.type === type &&
    node.operator === operator
  );
}

function chainOperands(right: TSESTree.Node, operator: string): TSESTree.Node[] {
  const lefts = chainOf<TSESTree.Node>(right, (node) =>
    isChainOf(node, operator) ? node.left : undefined,
  );
  const leftmost = lefts.at(-1) ?? right;
  if (!COMMUTATIVE.has(operator)) {
    return [leftmost];
  }
  return [
    leftmost,
    ...lefts.filter((node) => isChainOf(node, operator)).map(({ right: side }) => side),
  ];
}

function isRepeatedTarget(
  node: TSESTree.AssignmentExpression,
  operator: string,
  sourceCode: Text,
): boolean {
  const target = toTerm(node.left, sourceCode);
  if (!isStable(target)) {
    return false;
  }
  const targetKey = key(target);
  return chainOperands(node.right, operator).some(
    (side) => key(toTerm(side, sourceCode)) === targetKey,
  );
}

export function assignmentReport(
  node: TSESTree.AssignmentExpression,
  sourceCode: Text,
): TSESLint.ReportDescriptor<'misrefactoredAssignment'> | undefined {
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
