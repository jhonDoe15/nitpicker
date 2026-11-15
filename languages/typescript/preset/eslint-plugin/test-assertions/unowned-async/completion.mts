import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  type SourceContext,
} from '../../rules/analysis/constant-resolution.mts';
import { ancestorsOf } from '../../rules/typed/node-views.mts';
import { enclosingFunction } from '../../test-quality/test-calls.mts';
import { propertyName, type FunctionNode } from './nodes.mts';

type PromiseExecutor = FunctionNode & { readonly parent: TSESTree.NewExpression };
type Carried = { readonly completed: true } | { readonly next: readonly TSESTree.Node[] };
type HostLike = { readonly node: TSESTree.Node };

const COMPLETIONS = new Set(['AwaitExpression', 'YieldExpression']);
const CARRIERS = new Set([
  'ArrayExpression',
  'ConditionalExpression',
  'LogicalExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'ChainExpression',
  'CallExpression',
  'NewExpression',
  'MemberExpression',
  'SpreadElement',
]);
const COLLECTING_METHODS = new Set(['push', 'unshift']);
const SCHEDULER_NAME = /scheduler/iu;

function isPromiseExecutor(node: TSESTree.Node): node is PromiseExecutor {
  const owner = node.parent;
  return (
    isFunctionNode(node) &&
    owner?.type === AST_NODE_TYPES.NewExpression &&
    owner.callee.type === AST_NODE_TYPES.Identifier &&
    owner.callee.name === 'Promise' &&
    owner.arguments[0] === node
  );
}

function usesOf(context: SourceContext, identifier: TSESTree.Node | undefined): TSESTree.Node[] {
  const variable =
    identifier?.type === AST_NODE_TYPES.Identifier
      ? findVariable(context, identifier, identifier.name)
      : undefined;
  return (variable?.references ?? []).filter((ref) => !ref.init).map((ref) => ref.identifier);
}

function isCompletion(parent: TSESTree.Node, node: TSESTree.Node, test: TSESTree.Node): boolean {
  if (COMPLETIONS.has(parent.type)) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ReturnStatement) {
    return enclosingFunction(parent) === test;
  }
  return parent === test && 'body' in parent && parent.body === node;
}

function boundIdentifier(parent: TSESTree.Node, node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
    return node.id ?? undefined;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === node) {
    return parent.id;
  }
  return parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === node
    ? parent.left
    : undefined;
}

function collectingArray(parent: TSESTree.Node, node: TSESTree.Node): TSESTree.Node | undefined {
  if (
    parent.type !== AST_NODE_TYPES.CallExpression ||
    !parent.arguments.some((argument) => argument === node) ||
    parent.callee.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return undefined;
  }
  const name = propertyName(parent.callee);
  return name !== undefined && COLLECTING_METHODS.has(name) ? parent.callee.object : undefined;
}

function enclosingValue(parent: TSESTree.Node, node: TSESTree.Node): TSESTree.Node[] {
  if (parent.type === AST_NODE_TYPES.ReturnStatement) {
    const owner = enclosingFunction(parent);
    return owner === undefined ? [] : [owner];
  }
  if (parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === node) {
    return [parent];
  }
  return parent.type === AST_NODE_TYPES.Property && parent.value === node ? [parent.parent] : [];
}

function carriedTo(context: SourceContext, node: TSESTree.Node, test: TSESTree.Node): Carried {
  const { parent } = node;
  if (!parent) {
    return { next: [] };
  }
  if (isCompletion(parent, node, test)) {
    return { completed: true };
  }
  const direct = CARRIERS.has(parent.type) ? [parent] : [];
  const bound = [boundIdentifier(parent, node), collectingArray(parent, node)];
  return {
    next: [
      ...direct,
      ...enclosingValue(parent, node),
      ...bound.flatMap((identifier) => usesOf(context, identifier)),
    ],
  };
}

function isCompleted(context: SourceContext, promise: TSESTree.Node, test: TSESTree.Node): boolean {
  const pending = new Set([promise]);
  for (const node of pending) {
    const carried = carriedTo(context, node, test);
    if ('completed' in carried) {
      return true;
    }
    for (const next of carried.next) {
      pending.add(next);
    }
  }
  return false;
}

export function isInsideCompletedPromise(
  context: SourceContext,
  host: HostLike,
  test: TSESTree.Node,
): boolean {
  const ancestors = ancestorsOf(host.node);
  const executors = ancestors.slice(0, ancestors.indexOf(test)).filter(isPromiseExecutor);
  return executors.some((executor) => isCompleted(context, executor.parent, test));
}

function isSchedulerCallback(node: TSESTree.Node): boolean {
  const call = node.parent?.type === AST_NODE_TYPES.CallExpression ? node.parent : undefined;
  const isArgument =
    isFunctionNode(node) &&
    call !== undefined &&
    call.arguments.some((argument) => argument === node);
  const object =
    isArgument && call.callee.type === AST_NODE_TYPES.MemberExpression
      ? call.callee.object
      : undefined;
  const receiver = object?.type === AST_NODE_TYPES.Identifier ? object.name : propertyName(object);
  return propertyName(call?.callee) === 'run' && SCHEDULER_NAME.test(receiver ?? '');
}

export function isInsideScheduler(host: HostLike, test: TSESTree.Node): boolean {
  const ancestors = ancestorsOf(host.node);
  return ancestors.slice(0, ancestors.indexOf(test)).some(isSchedulerCallback);
}
