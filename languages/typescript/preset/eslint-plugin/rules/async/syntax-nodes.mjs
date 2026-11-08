import { depthFirst, objectChildren } from '../../../../../../shared/traversal.mjs';
import { findVariable, isFunctionNode, resolveConstant } from '../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';

const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);

export function nodesIn(root) {
  if (root === undefined || root === null) {
    return [];
  }
  return [...depthFirst(root, objectChildren)].filter((node) => typeof node.type === 'string');
}

function ownChildren(root, node) {
  return node !== root && isFunctionNode(node) ? [] : objectChildren(node);
}

export function ownNodesIn(root) {
  return [...depthFirst(root, (node) => ownChildren(root, node))].filter(
    (node) => typeof node.type === 'string',
  );
}

function isGlobalName(context, node, name) {
  return (
    node?.type === 'Identifier' &&
    node.name === name &&
    (findVariable(context, node, name)?.defs.length ?? 0) === 0
  );
}

function isGlobalValue(context, node, name) {
  const target = unwrapped(resolveConstant(context, unwrapped(node)));
  if (target?.type !== 'MemberExpression') {
    return isGlobalName(context, target, name);
  }
  const owner = unwrapped(target.object);
  return (
    memberName(target) === name &&
    owner.type === 'Identifier' &&
    GLOBAL_OBJECTS.has(owner.name) &&
    isGlobalName(context, owner, owner.name)
  );
}

export function globalMemberCall(context, node, qualified) {
  const [owner, method] = qualified.split('.');
  const callee = node?.type === 'CallExpression' ? unwrapped(node.callee) : undefined;
  return (
    callee?.type === 'MemberExpression' &&
    memberName(callee) === method &&
    isGlobalValue(context, callee.object, owner)
  );
}

export function isGlobalTimerCall(context, node) {
  return node?.type === 'CallExpression' && isGlobalValue(context, node.callee, 'setTimeout');
}

export function isPromiseConstruction(context, node) {
  return node?.type === 'NewExpression' && isGlobalValue(context, node.callee, 'Promise');
}
