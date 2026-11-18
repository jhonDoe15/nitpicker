import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
} from '../../analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../../security/security-values.mts';
import { depthFirst, nodeChildren } from '../../typed/node-views.mts';

const GLOBAL_OBJECTS = new Set<string>(['globalThis', 'window', 'self', 'global']);

export function nodesIn(root: TSESTree.Node | undefined): TSESTree.Node[] {
  if (root === undefined) {
    return [];
  }
  return [...depthFirst<TSESTree.Node>(root, nodeChildren)];
}

function ownChildren(root: TSESTree.Node, node: TSESTree.Node): TSESTree.Node[] {
  return node !== root && isFunctionNode(node) ? [] : nodeChildren(node);
}

export function ownNodesIn(root: TSESTree.Node): TSESTree.Node[] {
  return [...depthFirst<TSESTree.Node>(root, (node) => ownChildren(root, node))];
}

function isGlobalName(context: Context, node: TSESTree.Node | undefined, name: string): boolean {
  return (
    node?.type === AST_NODE_TYPES.Identifier &&
    node.name === name &&
    (findVariable(context, node, name)?.defs.length ?? 0) === 0
  );
}

function isGlobalValue(context: Context, node: TSESTree.Node | undefined, name: string): boolean {
  const target = unwrapped(resolveConstant(context, unwrapped(node)));
  if (target?.type !== AST_NODE_TYPES.MemberExpression) {
    return isGlobalName(context, target, name);
  }
  const owner = unwrapped(target.object);
  return (
    memberName(target) === name &&
    owner.type === AST_NODE_TYPES.Identifier &&
    GLOBAL_OBJECTS.has(owner.name) &&
    isGlobalName(context, owner, owner.name)
  );
}

export function globalMemberCall(
  context: Context,
  node: TSESTree.Node | undefined,
  qualified: string,
): boolean {
  const [owner, method] = qualified.split('.');
  const callee = node?.type === AST_NODE_TYPES.CallExpression ? unwrapped(node.callee) : undefined;
  return (
    callee?.type === AST_NODE_TYPES.MemberExpression &&
    memberName(callee) === method &&
    owner !== undefined &&
    isGlobalValue(context, callee.object, owner)
  );
}

export function isGlobalTimerCall(context: Context, node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    isGlobalValue(context, node.callee, 'setTimeout')
  );
}

export function isPromiseConstruction(context: Context, node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.NewExpression && isGlobalValue(context, node.callee, 'Promise')
  );
}
