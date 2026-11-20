import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ASSERTION_FORMS, unwrapOf } from '../typed/syntax-views.mts';
import { depthFirst, nodeChildren } from '../typed/node-views.mts';
import { isNonZeroNumber, type Comparator } from './comparator-outcomes.mts';

const MISSING_OPERATORS = new Set(['==', '===']);
const PRESENT_OPERATORS = new Set(['!=', '!==']);

function namesIn(node: TSESTree.Node): Set<string> {
  const names = new Set<string>();
  for (const current of depthFirst<TSESTree.Node>(node, nodeChildren)) {
    if (current.type === AST_NODE_TYPES.Identifier) {
      names.add(current.name);
    }
  }
  return names;
}

function isMissingValue(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') ||
    (node.type === AST_NODE_TYPES.Literal && node.value === null && node.raw === 'null')
  );
}

function missingOperand(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!') {
    return node.argument;
  }
  if (node.type !== AST_NODE_TYPES.BinaryExpression || !MISSING_OPERATORS.has(node.operator)) {
    return undefined;
  }
  if (isMissingValue(node.right)) {
    return node.left;
  }
  return isMissingValue(node.left) ? node.right : undefined;
}

function logicalArms(node: TSESTree.Node, operator: '||' | '&&'): TSESTree.Node[] {
  const value = unwrapOf(node, ASSERTION_FORMS);
  return value.type === AST_NODE_TYPES.LogicalExpression && value.operator === operator
    ? [value.left, value.right]
    : [];
}

function parts(node: TSESTree.Node, operator: '||' | '&&'): TSESTree.Node[] {
  const found: TSESTree.Node[] = [];
  for (const item of depthFirst(node, (current) => logicalArms(current, operator))) {
    if (logicalArms(item, operator).length === 0) {
      found.push(unwrapOf(item, ASSERTION_FORMS));
    }
  }
  return found;
}

function presentOperand(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type !== AST_NODE_TYPES.BinaryExpression) {
    return node.type === AST_NODE_TYPES.UnaryExpression ? undefined : node;
  }
  if (!PRESENT_OPERATORS.has(node.operator)) {
    return undefined;
  }
  if (isMissingValue(node.right)) {
    return node.left;
  }
  return isMissingValue(node.left) ? node.right : undefined;
}

function coversBothSides(
  nodes: readonly TSESTree.Node[],
  operandOf: (node: TSESTree.Node) => TSESTree.Node | undefined,
  { left, right }: Comparator,
): boolean {
  const sides = new Set<string>();
  for (const node of nodes) {
    const operand = operandOf(node);
    const names = operand === undefined ? new Set<string>() : namesIn(operand);
    if (names.has(left) !== names.has(right)) {
      sides.add(names.has(left) ? left : right);
    }
  }
  return sides.size === 2;
}

export function testsMissingBothSides(test: TSESTree.Node, comparator: Comparator): boolean {
  return coversBothSides(parts(test, '||'), missingOperand, comparator);
}

export function testsPresentBothSides(test: TSESTree.Node, comparator: Comparator): boolean {
  return coversBothSides(parts(test, '&&'), presentOperand, comparator);
}

export function isSideIndependent(
  node: TSESTree.Node | undefined,
  comparator: Comparator,
): boolean {
  if (node === undefined) {
    return false;
  }
  const value = unwrapOf(node, ASSERTION_FORMS);
  const inner =
    value.type === AST_NODE_TYPES.UnaryExpression && value.operator === '-'
      ? value.argument
      : value;
  const names = namesIn(inner);
  return (
    !names.has(comparator.left) &&
    !names.has(comparator.right) &&
    (isNonZeroNumber(value) || inner.type === AST_NODE_TYPES.Identifier)
  );
}
