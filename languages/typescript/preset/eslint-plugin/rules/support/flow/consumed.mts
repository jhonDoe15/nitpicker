import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { nameOf, outermostWrapper } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';

const PROMISE_STEPS = new Set(['then', 'catch', 'finally']);
const COMBINATORS = new Set(['all', 'allSettled', 'any', 'race']);
const ESTREE_WRAPPERS = new Set<string>([
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
]);
const ESTREE_SINKS = new Set<string>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.YieldExpression,
]);
const TERMINAL_METHODS = new Set([
  'exec',
  'then',
  'first',
  'execute',
  'executeTakeFirst',
  'executeTakeFirstOrThrow',
  'getMany',
  'getOne',
  'getOneOrFail',
  'getRawMany',
  'getRawOne',
  'getManyAndCount',
  'getCount',
  'getExists',
  'stream',
]);

export function isTerminalMethod(method: string | undefined): boolean {
  return method !== undefined && TERMINAL_METHODS.has(method);
}

function estreeMemberName(node: TSESTree.Node | undefined): string | undefined {
  return node?.type === AST_NODE_TYPES.MemberExpression && !node.computed
    ? node.property.name
    : undefined;
}

function isEstreeCollected(node: TSESTree.Node): boolean {
  const { parent } = node;
  const host = parent?.type === AST_NODE_TYPES.ArrayExpression ? parent.parent : parent;
  if (host?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const collector = estreeMemberName(host.callee);
  const combined =
    collector !== undefined &&
    COMBINATORS.has(collector) &&
    host.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(host.callee.object) === 'Promise';
  return collector === 'push' || combined;
}

function isPromiseStep(name: string | undefined): boolean {
  return name !== undefined && PROMISE_STEPS.has(name);
}

export function isEstreeConsumed(call: TSESTree.Node): boolean {
  const node = outermostWrapper(call, ESTREE_WRAPPERS);
  const { parent } = node;
  if (parent === undefined) {
    return false;
  }
  if (ESTREE_SINKS.has(parent.type)) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === node) {
    return true;
  }
  const stepped = parent.type === AST_NODE_TYPES.MemberExpression && parent.object === node;
  return (stepped && isPromiseStep(estreeMemberName(parent))) || isEstreeCollected(node);
}

function tsOuter(call: TypeScript.Node): TypeScript.Node {
  const chain = [call];
  for (const node of chain) {
    const { parent } = node;
    if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent)) {
      chain.push(parent);
    }
  }
  return chain.at(-1) ?? call;
}

function isTsCollected(node: TypeScript.Node): boolean {
  const { parent } = node;
  const host = ts.isArrayLiteralExpression(parent) ? parent.parent : parent;
  if (!(ts.isCallExpression(host) && ts.isPropertyAccessExpression(host.expression))) {
    return false;
  }
  const { name, expression } = host.expression;
  const combined =
    COMBINATORS.has(name.text) && ts.isIdentifier(expression) && expression.text === 'Promise';
  return name.text === 'push' || combined;
}

export function isTsConsumed(call: TypeScript.Node): boolean {
  const node = tsOuter(call);
  const { parent } = node;
  const sink =
    ts.isAwaitExpression(parent) ||
    ts.isReturnStatement(parent) ||
    ts.isYieldExpression(parent) ||
    (ts.isArrowFunction(parent) && parent.body === node);
  if (sink) {
    return true;
  }
  const stepped =
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    PROMISE_STEPS.has(parent.name.text);
  return stepped || isTsCollected(node);
}
