import { findVariable } from '../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';

function childNodes(node, visitorKeys) {
  return (visitorKeys[node.type] ?? [])
    .flatMap((key) => [node[key]].flat())
    .filter((child) => typeof child?.type === 'string');
}

export function nodesIn(root, visitorKeys) {
  const found = root === undefined || root === null ? [] : [root];
  for (const node of found) {
    found.push(...childNodes(node, visitorKeys));
  }
  return found;
}

export function isGlobalName(context, node, name) {
  return (
    node?.type === 'Identifier' &&
    node.name === name &&
    (findVariable(context, node, name)?.defs.length ?? 0) === 0
  );
}

export function globalMemberCall(context, node, owner, method) {
  const callee = node?.type === 'CallExpression' ? unwrapped(node.callee) : undefined;
  return (
    callee?.type === 'MemberExpression' &&
    isGlobalName(context, unwrapped(callee.object), owner) &&
    memberName(callee) === method
  );
}

export function isGlobalTimerCall(context, node) {
  if (node?.type !== 'CallExpression') {
    return false;
  }
  const callee = unwrapped(node.callee);
  return (
    isGlobalName(context, callee, 'setTimeout') ||
    globalMemberCall(context, node, 'globalThis', 'setTimeout')
  );
}

export function isPromiseConstruction(context, node) {
  return node?.type === 'NewExpression' && isGlobalName(context, node.callee, 'Promise');
}
