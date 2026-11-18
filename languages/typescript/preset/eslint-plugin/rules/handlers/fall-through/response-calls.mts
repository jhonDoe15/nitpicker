import { AST_NODE_TYPES, ASTUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { syntaxChildren } from '../../decided/syntax.mts';
import { depthFirst } from '../../typed/node-views.mts';

const RESPONSE_NAMES = new Set<string>(['res', 'response', 'reply']);
const CONTINUATION_NAMES = new Set<string>(['next', 'callback', 'cb', 'done']);
const SENDERS = new Set<string>([
  'send',
  'json',
  'end',
  'redirect',
  'sendStatus',
  'sendFile',
  'jsonp',
]);
const CHAINED = new Set<string>([
  'status',
  'code',
  'set',
  'header',
  'type',
  'contentType',
  'cookie',
]);
const LOGGERS = new Set<string>(['console', 'logger', 'log']);

export type Handoff = { readonly text: string; readonly name: string };

function enclosingFunction(node: TSESTree.Node): TSESTree.FunctionLike | undefined {
  for (let current = node.parent; current; current = current.parent) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return current;
    }
  }
  return undefined;
}

function isParameter(code: TSESLint.SourceCode, identifier: TSESTree.Identifier): boolean {
  const variable = ASTUtils.findVariable(code.getScope(identifier), identifier);
  return variable?.defs[0]?.type === 'Parameter';
}

function lastParameter(fn: TSESTree.FunctionLike | undefined, name: string): boolean {
  const last = fn?.params.at(-1);
  return last?.type === AST_NODE_TYPES.Identifier && last.name === name;
}

function unwrapCall(statement: TSESTree.Node): TSESTree.CallExpression | undefined {
  if (statement.type !== AST_NODE_TYPES.ExpressionStatement) {
    return undefined;
  }
  const inner =
    statement.expression.type === AST_NODE_TYPES.AwaitExpression
      ? statement.expression.argument
      : statement.expression;
  const call = inner.type === AST_NODE_TYPES.ChainExpression ? inner.expression : inner;
  return call.type === AST_NODE_TYPES.CallExpression ? call : undefined;
}

function responseRoot(call: TSESTree.CallExpression): TSESTree.Identifier | undefined {
  const callee = call.callee;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.property.type !== AST_NODE_TYPES.Identifier ||
    !SENDERS.has(callee.property.name)
  ) {
    return undefined;
  }
  let current: TSESTree.Node = callee.object;
  while (current.type === AST_NODE_TYPES.CallExpression) {
    const inner: TSESTree.Node = current.callee;
    if (
      inner.type !== AST_NODE_TYPES.MemberExpression ||
      inner.computed ||
      inner.property.type !== AST_NODE_TYPES.Identifier ||
      !CHAINED.has(inner.property.name)
    ) {
      return undefined;
    }
    current = inner.object;
  }
  return current.type === AST_NODE_TYPES.Identifier && RESPONSE_NAMES.has(current.name)
    ? current
    : undefined;
}

export function handoffOf(
  code: TSESLint.SourceCode,
  statement: TSESTree.Node,
): Handoff | undefined {
  const call = unwrapCall(statement);
  if (call === undefined) {
    return undefined;
  }
  const fn = enclosingFunction(statement);
  const root = responseRoot(call);
  if (root !== undefined && isParameter(code, root)) {
    return { text: `${root.name} response`, name: root.name };
  }
  const callee = call.callee;
  if (
    callee.type === AST_NODE_TYPES.Identifier &&
    CONTINUATION_NAMES.has(callee.name) &&
    lastParameter(fn, callee.name) &&
    isParameter(code, callee)
  ) {
    return { text: `${callee.name}()`, name: callee.name };
  }
  return undefined;
}

function isLogging(statement: TSESTree.Node): boolean {
  const call = unwrapCall(statement);
  let current: TSESTree.Node | undefined = call?.callee;
  while (current?.type === AST_NODE_TYPES.MemberExpression) {
    current = current.object;
  }
  return current?.type === AST_NODE_TYPES.Identifier && LOGGERS.has(current.name);
}

function runsCode(expression: TSESTree.Node): boolean {
  return [
    ...depthFirst<TSESTree.Node>(expression, (node) =>
      node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionExpression
        ? []
        : syntaxChildren(node),
    ),
  ].some(
    (node) =>
      node.type === AST_NODE_TYPES.CallExpression ||
      node.type === AST_NODE_TYPES.NewExpression ||
      node.type === AST_NODE_TYPES.AwaitExpression,
  );
}

export function isRealWork(statement: TSESTree.Node): boolean {
  if (statement.type === AST_NODE_TYPES.ReturnStatement) {
    return statement.argument !== null && runsCode(statement.argument);
  }
  return (
    statement.type !== AST_NODE_TYPES.BreakStatement &&
    statement.type !== AST_NODE_TYPES.ContinueStatement &&
    statement.type !== AST_NODE_TYPES.EmptyStatement &&
    !isLogging(statement)
  );
}
