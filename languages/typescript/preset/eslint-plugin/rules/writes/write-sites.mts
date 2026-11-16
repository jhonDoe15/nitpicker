import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { heldScope } from '../effects/held-scopes.mts';
import type { Context } from '../security/security-values.mts';
import type { Effects } from '../support/io/call-tags.mts';
import { ancestorsOf, contains, nameOf } from '../typed/node-views.mts';

export type Site = {
  readonly call: TSESTree.CallExpression | TSESTree.TaggedTemplateExpression;
  readonly effects: Effects;
};
type Callback = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;

function isCallback(node: TSESTree.Node): node is Callback {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

function isCommittedBefore(write: Site, publish: Site, context: Context): boolean {
  const scope = heldScope('transaction', write.call, context);
  const closing = scope?.closing;
  return closing !== undefined && closing.range[1] <= publish.call.range[0];
}

function isInAfterCommitHook(call: TSESTree.Node, unit: TSESTree.Node): boolean {
  return ancestorsOf(call)
    .filter(
      (ancestor): ancestor is Callback =>
        isCallback(ancestor) && contains(unit, ancestor) && ancestor !== unit,
    )
    .some(
      (fn) =>
        fn.parent.type === AST_NODE_TYPES.CallExpression &&
        fn.parent.arguments.some((argument) => argument === fn) &&
        fn.parent.callee.type === AST_NODE_TYPES.MemberExpression &&
        nameOf(fn.parent.callee.property) === 'afterCommit',
    );
}

export function publishesAfterCommit(
  publish: Site,
  writes: Site[],
  { context, unit }: { readonly context: Context; readonly unit: TSESTree.Node },
): boolean {
  return (
    isInAfterCommitHook(publish.call, unit) ||
    writes.every((write) => isCommittedBefore(write, publish, context))
  );
}
