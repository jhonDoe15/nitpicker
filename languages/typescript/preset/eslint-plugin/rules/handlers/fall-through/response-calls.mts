import { AST_NODE_TYPES, ASTUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { syntaxChildren } from '../../decided/syntax.mts';
import { ancestorsOf, chainOf, depthFirst } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';

const { DefinitionType } = TSESLint.Scope;

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
  return ancestorsOf(node).find(isFunction);
}

function isParameter(code: TSESLint.SourceCode, identifier: TSESTree.Identifier): boolean {
  const variable = ASTUtils.findVariable(code.getScope(identifier), identifier);
  return variable?.defs[0]?.type === DefinitionType.Parameter;
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

function chainedObject(link: TSESTree.Node): TSESTree.Node | undefined {
  if (link.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const inner = link.callee;
  const chained =
    inner.type === AST_NODE_TYPES.MemberExpression &&
    !inner.computed &&
    inner.property.type === AST_NODE_TYPES.Identifier &&
    CHAINED.has(inner.property.name);
  return chained ? inner.object : undefined;
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
  const root = chainOf<TSESTree.Node>(callee.object, chainedObject).at(-1);
  return root?.type === AST_NODE_TYPES.Identifier && RESPONSE_NAMES.has(root.name)
    ? root
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
  const root = chainOf<TSESTree.Node>(call?.callee, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  ).at(-1);
  return root?.type === AST_NODE_TYPES.Identifier && LOGGERS.has(root.name);
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
