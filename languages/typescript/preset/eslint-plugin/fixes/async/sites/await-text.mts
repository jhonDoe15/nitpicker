import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../../rules/typed/node-views.mts';

const BARE_PARENTS = new Set<string>([
  AST_NODE_TYPES.ExpressionStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.VariableDeclarator,
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.AssignmentPattern,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.SpreadElement,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.SwitchStatement,
  AST_NODE_TYPES.SwitchCase,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.SequenceExpression,
  AST_NODE_TYPES.YieldExpression,
]);
const SAFE_TOKENS = new Set([';', '{']);

function isArgument(parent: TSESTree.Node, call: TSESTree.Node): boolean {
  return (
    (parent.type === AST_NODE_TYPES.CallExpression ||
      parent.type === AST_NODE_TYPES.NewExpression) &&
    parent.arguments.some((argument) => argument === call)
  );
}

function isBare(call: TSESTree.CallExpression): boolean {
  const { parent } = call;
  if (BARE_PARENTS.has(parent.type) || isArgument(parent, call)) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.Property) {
    return parent.value === call;
  }
  return (
    parent.type === AST_NODE_TYPES.BinaryExpression &&
    !(parent.operator === '**' && parent.left === call)
  );
}

function statementStartingWith(call: TSESTree.Node): TSESTree.Node | undefined {
  let node: TSESTree.Node | undefined = call;
  while (node !== undefined && node.type !== AST_NODE_TYPES.ExpressionStatement) {
    const parent: TSESTree.Node | undefined = node.parent;
    node = parent?.range[0] === node.range[0] ? parent : undefined;
  }
  return node;
}

function closesStatementBlock(sourceCode: SourceCode, index: number): boolean {
  const block = sourceCode.getNodeByRangeIndex(index);
  return (
    block?.type === AST_NODE_TYPES.BlockStatement &&
    block.parent.type !== AST_NODE_TYPES.FunctionExpression &&
    block.parent.type !== AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function endsStatement(sourceCode: SourceCode, statement: TSESTree.Node): boolean {
  const previous = sourceCode.getTokenBefore(statement);
  if (previous === null || SAFE_TOKENS.has(previous.value)) {
    return true;
  }
  return previous.value === '}' && closesStatementBlock(sourceCode, previous.range[0]);
}

export function awaiting(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  expression: string,
): string | undefined {
  if (call.parent.type === AST_NODE_TYPES.AwaitExpression) {
    return expression;
  }
  if (isBare(call)) {
    return `await ${expression}`;
  }
  const statement = statementStartingWith(call);
  return statement === undefined || endsStatement(sourceCode, statement)
    ? `(await ${expression})`
    : undefined;
}
