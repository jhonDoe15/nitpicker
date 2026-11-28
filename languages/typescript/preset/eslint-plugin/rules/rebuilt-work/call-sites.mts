import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { referencesOf, type SourceContext } from '../analysis/constant-resolution.mts';
import { innermostRepeat } from '../repeated-work/support/loop-invariance.mts';
import { depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';
import type { FunctionNode } from '../typed/syntax-views.mts';

const MANY_CALLS = 3;

function methodCalls(method: TSESTree.MethodDefinition): TSESTree.CallExpression[] {
  const name = nameOf(method.key);
  return [...depthFirst<TSESTree.Node>(method.parent, nodeChildren)].filter(
    (node): node is TSESTree.CallExpression =>
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.object.type === AST_NODE_TYPES.ThisExpression &&
      nameOf(node.callee.property) === name,
  );
}

function bindingOf(fn: FunctionNode): TSESTree.Identifier | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn.id ?? undefined;
  }
  const { parent } = fn;
  return parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
    ? parent.id
    : undefined;
}

function functionCalls(
  context: SourceContext,
  binding: TSESTree.Identifier,
): TSESTree.CallExpression[] {
  return referencesOf(context, binding, binding.name).flatMap(({ identifier }) => {
    const { parent } = identifier;
    return parent.type === AST_NODE_TYPES.CallExpression && parent.callee === identifier
      ? [parent]
      : [];
  });
}

function callsOf(context: SourceContext, fn: FunctionNode): TSESTree.CallExpression[] {
  const { parent } = fn;
  if (parent.type === AST_NODE_TYPES.MethodDefinition && parent.value === fn && !parent.static) {
    return methodCalls(parent);
  }
  const binding = bindingOf(fn);
  return binding === undefined ? [] : functionCalls(context, binding);
}

export function calledRepeatedly(context: SourceContext, fn: FunctionNode): boolean {
  const calls = callsOf(context, fn);
  return calls.length >= MANY_CALLS || calls.some((call) => innermostRepeat(call) !== undefined);
}
