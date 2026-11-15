import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { nameOf } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const ITERATION_METHODS = [
  'map',
  'forEach',
  'flatMap',
  'filter',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'sort',
  'toSorted',
];
const PROMISE_STEPS = ['then', 'catch', 'finally'];
const SCOPE_OPENERS = [
  '$transaction',
  'transaction',
  'transactional',
  'runExclusive',
  'acquire',
  'request',
  'using',
  'afterCommit',
];
const RETRY_WRAPPERS = ['pRetry', 'retry', 'backOff', 'execute'];
const SYNC_CALLEES = new Set([
  ...ITERATION_METHODS,
  ...PROMISE_STEPS,
  ...SCOPE_OPENERS,
  ...RETRY_WRAPPERS,
]);
const PROMISE = 'Promise';

function estreeCalleeName(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? nameOf(callee.property)
    : undefined;
}

export function estreeRunsWithCaller(fn: FunctionNode): boolean {
  const { parent } = fn;
  if (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === fn) {
    return true;
  }
  const isArgument =
    (parent.type === AST_NODE_TYPES.CallExpression ||
      parent.type === AST_NODE_TYPES.NewExpression) &&
    parent.arguments.some((argument) => argument === fn);
  if (!isArgument) {
    return false;
  }
  const name = estreeCalleeName(parent.callee);
  return parent.type === AST_NODE_TYPES.NewExpression
    ? name === PROMISE
    : name !== undefined && SYNC_CALLEES.has(name);
}

function tsCalleeName(callee: TypeScript.Node): string | undefined {
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

function tsOuter(fn: TypeScript.Node): TypeScript.Node {
  const chain = [fn];
  for (const node of chain) {
    if (ts.isParenthesizedExpression(node.parent)) {
      chain.push(node.parent);
    }
  }
  return chain.at(-1) ?? fn;
}

export function tsRunsWithCaller(fn: TypeScript.Node): boolean {
  const outer = tsOuter(fn);
  const { parent } = outer;
  if (ts.isCallExpression(parent) && parent.expression === outer) {
    return true;
  }
  const isArgument =
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    (parent.arguments ?? []).some((argument) => argument === outer);
  if (!isArgument) {
    return false;
  }
  const name = tsCalleeName(parent.expression);
  return ts.isNewExpression(parent)
    ? name === PROMISE
    : name !== undefined && SYNC_CALLEES.has(name);
}
