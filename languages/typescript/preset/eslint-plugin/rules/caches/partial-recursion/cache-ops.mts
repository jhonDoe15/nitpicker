import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, nodeChildren, nodesWithoutNested } from '../../typed/node-views.mts';
import { calleeNameOf, unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';

export type CacheWrite = {
  readonly target: string;
  readonly node: TSESTree.Node;
  readonly value: TSESTree.Expression;
};

const NESTED_SCOPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.ClassDeclaration,
  AST_NODE_TYPES.ClassExpression,
]);

const CACHE_READ_METHODS = new Set<string>(['get', 'has']);

export function subtreeNodes(root: TSESTree.Node): TSESTree.Node[] {
  return nodesWithoutNested(root, NESTED_SCOPES, nodeChildren);
}

export function bodyNodesOf(fn: FunctionNode): TSESTree.Node[] {
  return subtreeNodes(fn.body);
}

export function targetNameOf(node: TSESTree.Node): string | undefined {
  const inner = unwrapped(node);
  if (inner.type === AST_NODE_TYPES.Identifier) {
    return inner.name;
  }
  if (inner.type !== AST_NODE_TYPES.MemberExpression || inner.computed) {
    return undefined;
  }
  const prop = nameOf(inner.property);
  if (prop === undefined) {
    return undefined;
  }
  if (inner.object.type === AST_NODE_TYPES.ThisExpression) {
    return `this.${prop}`;
  }
  const owner = nameOf(inner.object);
  return owner === undefined ? undefined : `${owner}.${prop}`;
}

export function methodCallTarget(
  node: TSESTree.Node,
  methods: ReadonlySet<string>,
): string | undefined {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const method = calleeNameOf(callee);
  return method !== undefined && methods.has(method) ? targetNameOf(callee.object) : undefined;
}

function isWriteTarget(node: TSESTree.MemberExpression): boolean {
  const { parent } = node;
  if (parent?.type === AST_NODE_TYPES.AssignmentExpression && parent.left === node) {
    return true;
  }
  return parent?.type === AST_NODE_TYPES.UpdateExpression && parent.argument === node;
}

function cacheReadTarget(node: TSESTree.Node): string | undefined {
  const viaCall = methodCallTarget(node, CACHE_READ_METHODS);
  if (viaCall !== undefined) {
    return viaCall;
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === 'in') {
    return targetNameOf(node.right);
  }
  if (node.type === AST_NODE_TYPES.MemberExpression && node.computed && !isWriteTarget(node)) {
    return targetNameOf(node.object);
  }
  return undefined;
}

export function cacheReadsOf(nodes: readonly TSESTree.Node[]): Set<string> {
  const reads = new Set<string>();
  for (const node of nodes) {
    const target = cacheReadTarget(node);
    if (target !== undefined) {
      reads.add(target);
    }
  }
  return reads;
}

function callCacheWrite(node: TSESTree.CallExpression): CacheWrite | undefined {
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  if (calleeNameOf(callee) !== 'set' || node.arguments.length < 2) {
    return undefined;
  }
  const value = node.arguments[1];
  const target = targetNameOf(callee.object);
  return target !== undefined && value.type !== AST_NODE_TYPES.SpreadElement
    ? { target, node, value }
    : undefined;
}

function assignmentCacheWrite(node: TSESTree.AssignmentExpression): CacheWrite | undefined {
  if (node.operator !== '=' || node.left.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  if (!node.left.computed) {
    return undefined;
  }
  const target = targetNameOf(node.left.object);
  return target === undefined ? undefined : { target, node, value: node.right };
}

function cacheWriteOf(node: TSESTree.Node): CacheWrite | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return callCacheWrite(node);
  }
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return assignmentCacheWrite(node);
  }
  return undefined;
}

export function readWriteCacheWrites(nodes: readonly TSESTree.Node[]): CacheWrite[] {
  const reads = cacheReadsOf(nodes);
  if (reads.size === 0) {
    return [];
  }
  const writes: CacheWrite[] = [];
  for (const node of nodes) {
    const write = cacheWriteOf(node);
    if (write !== undefined && reads.has(write.target)) {
      writes.push(write);
    }
  }
  return writes;
}
