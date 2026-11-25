import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains, nameOf } from '../../typed/node-views.mts';
import { type FunctionNode } from '../../typed/syntax-views.mts';
import { methodCallTarget, subtreeNodes, targetNameOf, type CacheWrite } from './cache-ops.mts';
import { type RecursionGuard } from './recursion-guards.mts';

const CACHE_OR_GUARD_METHODS = new Set<string>([
  'get',
  'has',
  'set',
  'add',
  'delete',
  'includes',
  'push',
  'pop',
]);

const SIZE_PROPERTIES = new Set<string>(['size', 'length']);
const ZERO_COMPARE_OPS = new Set<string>(['===', '!==', '==', '!=', '>', '>=', '<', '<=']);
const PARTIAL_FLAG_NAME = new RegExp(
  '(?:partial|truncat|cycle|cyclic|guard|reent|recurs|cutoff|bail|incomplete|complete|' +
    'exact|final|stable|cacheable|canCache|shouldCache|dirty|tainted|poison|limit|' +
    'budget|overflow|fallback|unresolved|sawCycle|hitCycle|cycleHit|hitGuard|guardHit|' +
    'hitLimit|limitHit|depthHit|hitDepth)',
  'iu',
);

function isZeroLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === 0;
}

function isGuardStateNode(node: TSESTree.Node, guard: RecursionGuard): boolean {
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    targetNameOf(node.object) === guard.name &&
    SIZE_PROPERTIES.has(nameOf(node.property) ?? '')
  ) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && ZERO_COMPARE_OPS.has(node.operator)) {
    const leftMatch = targetNameOf(node.left) === guard.name && isZeroLiteral(node.right);
    const rightMatch = targetNameOf(node.right) === guard.name && isZeroLiteral(node.left);
    return leftMatch || rightMatch;
  }
  return false;
}

function isFlagReference(node: TSESTree.Node, guard: RecursionGuard): boolean {
  const target = targetNameOf(node);
  if (target !== undefined && guard.flagNames.has(target)) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.Identifier) {
    return PARTIAL_FLAG_NAME.test(node.name);
  }
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    PARTIAL_FLAG_NAME.test(nameOf(node.property) ?? '')
  );
}

function isPartialGuardCondition(expr: TSESTree.Expression, guard: RecursionGuard): boolean {
  return subtreeNodes(expr).some(
    (node) => isGuardStateNode(node, guard) || isFlagReference(node, guard),
  );
}

function exitsEarly(statement: TSESTree.Statement): boolean {
  return subtreeNodes(statement).some(
    (node) =>
      node.type === AST_NODE_TYPES.ReturnStatement || node.type === AST_NODE_TYPES.ThrowStatement,
  );
}

function ancestorsWithinFunction(node: TSESTree.Node, fn: FunctionNode): TSESTree.Node[] {
  const result: TSESTree.Node[] = [];
  for (const ancestor of ancestorsOf(node)) {
    if (ancestor === fn) {
      break;
    }
    result.push(ancestor);
  }
  return result;
}

function guardsViaAncestor(
  ancestor: TSESTree.Node,
  writeNode: TSESTree.Node,
  guard: RecursionGuard,
): boolean {
  if (ancestor.type === AST_NODE_TYPES.IfStatement) {
    return ancestor !== guard.ifNode && isPartialGuardCondition(ancestor.test, guard);
  }
  if (ancestor.type === AST_NODE_TYPES.ConditionalExpression) {
    return isPartialGuardCondition(ancestor.test, guard);
  }
  if (ancestor.type === AST_NODE_TYPES.LogicalExpression) {
    return contains(ancestor.right, writeNode) && isPartialGuardCondition(ancestor.left, guard);
  }
  return false;
}

function guardsViaPriorExit(
  block: TSESTree.BlockStatement,
  writeNode: TSESTree.Node,
  guard: RecursionGuard,
): boolean {
  for (const stmt of block.body) {
    if (stmt.range[1] > writeNode.range[0]) {
      break;
    }
    if (
      stmt.type === AST_NODE_TYPES.IfStatement &&
      stmt !== guard.ifNode &&
      exitsEarly(stmt.consequent) &&
      isPartialGuardCondition(stmt.test, guard)
    ) {
      return true;
    }
  }
  return false;
}

export function isGuardedWrite(
  write: CacheWrite,
  fn: FunctionNode,
  guard: RecursionGuard,
): boolean {
  for (const ancestor of ancestorsWithinFunction(write.node, fn)) {
    if (guardsViaAncestor(ancestor, write.node, guard)) {
      return true;
    }
    if (
      ancestor.type === AST_NODE_TYPES.BlockStatement &&
      guardsViaPriorExit(ancestor, write.node, guard)
    ) {
      return true;
    }
  }
  return false;
}

function isWorkCall(node: TSESTree.Node, write: CacheWrite, guard: RecursionGuard): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const target = methodCallTarget(node, CACHE_OR_GUARD_METHODS);
  return target !== write.target && target !== guard.name;
}

export function isSeedWrite(
  write: CacheWrite,
  nodes: readonly TSESTree.Node[],
  guard: RecursionGuard,
): boolean {
  if (guard.entryPos !== undefined && write.node.range[0] < guard.entryPos) {
    return true;
  }
  const valueHasCall = subtreeNodes(write.value).some(
    (node) => node.type === AST_NODE_TYPES.CallExpression,
  );
  if (valueHasCall) {
    return false;
  }
  return !nodes.some(
    (node) => node.range[0] < write.node.range[0] && isWorkCall(node, write, guard),
  );
}
