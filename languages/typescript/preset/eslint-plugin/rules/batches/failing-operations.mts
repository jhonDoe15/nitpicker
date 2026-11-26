import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains, depthFirst, nodeChildren } from '../typed/node-views.mts';
import { calleeNameOf, isCallExpression, isFunction } from '../typed/syntax-views.mts';
import type { BatchFunction } from './batch-inputs.mts';

const READS = new Set(['readFile', 'readFileSync']);
const SAFE_PARSE_OWNERS = new Set(['path', 'posix', 'win32']);

function isFailingCall(node: TSESTree.CallExpression): boolean {
  const name = calleeNameOf(node.callee);
  if (name === undefined) {
    return false;
  }
  if (READS.has(name)) {
    return true;
  }
  const { callee } = node;
  return (
    name === 'parse' &&
    !(
      callee.type === AST_NODE_TYPES.MemberExpression &&
      callee.object.type === AST_NODE_TYPES.Identifier &&
      SAFE_PARSE_OWNERS.has(callee.object.name)
    )
  );
}

function isHandled(call: TSESTree.CallExpression, within: BatchFunction): boolean {
  return ancestorsOf(call).some(
    (ancestor) =>
      contains(within, ancestor) &&
      ((ancestor.type === AST_NODE_TYPES.TryStatement &&
        ancestor.handler !== null &&
        contains(ancestor.block, call)) ||
        (isCallExpression(ancestor) &&
          ancestor.callee.type === AST_NODE_TYPES.MemberExpression &&
          ['catch', 'then'].includes(calleeNameOf(ancestor.callee) ?? '') &&
          (ancestor.arguments.length > 1 || calleeNameOf(ancestor.callee) === 'catch') &&
          contains(ancestor.callee.object, call))),
  );
}

export function unhandledFailingCall(callback: BatchFunction): TSESTree.CallExpression | undefined {
  return [
    ...depthFirst<TSESTree.Node>(callback.body, (node) => (isFunction(node) ? [] : nodeChildren(node))),
  ]
    .filter(isCallExpression)
    .find((call) => isFailingCall(call) && !isHandled(call, callback));
}
