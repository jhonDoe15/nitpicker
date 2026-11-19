import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../../analysis/constant-resolution.mts';
import { ancestorsOf, contains, nameOf } from '../../typed/node-views.mts';

const HOOKS = new Set(['afterCommit', 'onCommit']);
const EVENT_METHODS = new Set(['on', 'once']);

function isHookCall(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const method = nameOf(callee.property) ?? '';
  const [first] = call.arguments;
  const event = first?.type === AST_NODE_TYPES.Literal && first.value === 'commit';
  return HOOKS.has(method) || (EVENT_METHODS.has(method) && event);
}

function passesCallback(fn: TSESTree.Node): boolean {
  const call = fn.parent;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.some((argument) => argument === fn) &&
    isHookCall(call)
  );
}

export function inAfterCommitHook(node: TSESTree.Node, boundary: TSESTree.Node): boolean {
  return ancestorsOf(node)
    .filter((ancestor) => isFunctionNode(ancestor) && contains(boundary, ancestor))
    .some(passesCallback);
}
