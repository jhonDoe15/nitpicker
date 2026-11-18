import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../typed/node-views.mts';
import { ancestorsOf } from '../typed/node-views.mts';

const OVER = new Set(['>', '>=']);
const UNDER = new Set(['<', '<=']);

function contains(outer: TSESTree.Node, inner: TSESTree.Node): boolean {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

function lengthOf(node: TSESTree.Node, receiver: string, sourceCode: SourceCode): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === 'length' &&
    sourceCode.getText(node.object) === receiver
  );
}

interface BoundQuery {
  receiver: string;
  operators: ReadonlySet<string>;
  sourceCode: SourceCode;
}

const FLIPPED = new Map([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
]);

function comparedBound(test: TSESTree.Node, query: BoundQuery): string | undefined {
  const { receiver, operators, sourceCode } = query;
  if (test.type === AST_NODE_TYPES.LogicalExpression && test.operator === '&&') {
    return comparedBound(test.left, query) ?? comparedBound(test.right, query);
  }
  if (test.type !== AST_NODE_TYPES.BinaryExpression) {
    return undefined;
  }
  if (lengthOf(test.left, receiver, sourceCode) && operators.has(test.operator)) {
    return sourceCode.getText(test.right);
  }
  return lengthOf(test.right, receiver, sourceCode) &&
    operators.has(FLIPPED.get(test.operator) ?? '')
    ? sourceCode.getText(test.left)
    : undefined;
}

function leaves(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ReturnStatement || node.type === AST_NODE_TYPES.ThrowStatement) {
    return true;
  }
  return (
    node.type === AST_NODE_TYPES.BlockStatement &&
    node.body.length > 0 &&
    leaves(node.body.at(-1) as TSESTree.Node)
  );
}

function guardTest(ancestor: TSESTree.Node, node: TSESTree.Node): TSESTree.Node | undefined {
  if (
    (ancestor.type === AST_NODE_TYPES.IfStatement ||
      ancestor.type === AST_NODE_TYPES.ConditionalExpression) &&
    contains(ancestor.consequent, node)
  ) {
    return ancestor.test;
  }
  return ancestor.type === AST_NODE_TYPES.LogicalExpression &&
    ancestor.operator === '&&' &&
    contains(ancestor.right, node)
    ? ancestor.left
    : undefined;
}

function enclosingGuard(
  node: TSESTree.Node,
  receiver: string,
  sourceCode: SourceCode,
): string | undefined {
  const query = { receiver, operators: OVER, sourceCode };
  for (const ancestor of ancestorsOf(node)) {
    const test = guardTest(ancestor, node);
    const bound = test === undefined ? undefined : comparedBound(test, query);
    if (bound !== undefined) {
      return bound;
    }
  }
  return undefined;
}

function leavingBound(statements: readonly TSESTree.Node[], query: BoundQuery): string | undefined {
  for (const statement of statements) {
    const bound =
      statement.type === AST_NODE_TYPES.IfStatement && leaves(statement.consequent)
        ? comparedBound(statement.test, query)
        : undefined;
    if (bound !== undefined) {
      return bound;
    }
  }
  return undefined;
}

function earlyReturnGuard(
  node: TSESTree.Node,
  receiver: string,
  sourceCode: SourceCode,
): string | undefined {
  const query = { receiver, operators: UNDER, sourceCode };
  for (const ancestor of ancestorsOf(node)) {
    if (
      ancestor.type !== AST_NODE_TYPES.BlockStatement &&
      ancestor.type !== AST_NODE_TYPES.Program
    ) {
      continue;
    }
    const statements: readonly TSESTree.Node[] = ancestor.body;
    const index = statements.findIndex((statement) => contains(statement, node));
    const bound = leavingBound(statements.slice(0, Math.max(index, 0)), query);
    if (bound !== undefined) {
      return bound;
    }
  }
  return undefined;
}

export function guardBound(
  node: TSESTree.Node,
  receiver: string,
  sourceCode: SourceCode,
): string | undefined {
  return enclosingGuard(node, receiver, sourceCode) ?? earlyReturnGuard(node, receiver, sourceCode);
}
