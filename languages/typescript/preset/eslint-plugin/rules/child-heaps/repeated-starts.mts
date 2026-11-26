import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import { ancestorsOf, functionBinding, nameOf } from '../typed/node-views.mts';
import { isFunction } from '../typed/syntax-views.mts';
import { isLoop } from '../whole-lists/unbounded-lists.mts';

const FAN_OUTS = new Set([
  'map',
  'forEach',
  'flatMap',
  'all',
  'allSettled',
  'pMap',
  'mapLimit',
  'eachLimit',
  'mapConcurrent',
  'parallel',
  'limit',
]);

function isFanOutCallback(fn: TSESTree.Node): boolean {
  const { parent } = fn;
  if (
    parent?.type !== AST_NODE_TYPES.CallExpression ||
    !parent.arguments.some((argument) => argument === fn)
  ) {
    return false;
  }
  const { callee } = parent;
  const name = callee.type === AST_NODE_TYPES.MemberExpression ? callee.property : callee;
  return FAN_OUTS.has(nameOf(name) ?? '');
}

function repeatedInFunction(node: TSESTree.Node): {
  repeated: boolean;
  fn: TSESTree.Node | undefined;
} {
  for (const ancestor of ancestorsOf(node)) {
    if (isLoop(ancestor)) {
      return { repeated: true, fn: undefined };
    }
    if (isFunction(ancestor)) {
      return { repeated: isFanOutCallback(ancestor), fn: ancestor };
    }
  }
  return { repeated: false, fn: undefined };
}

export function startsRepeatedly(context: SourceContext, node: TSESTree.Node): boolean {
  const own = repeatedInFunction(node);
  if (own.repeated || own.fn === undefined || !isFunction(own.fn)) {
    return own.repeated;
  }
  const binding = functionBinding(own.fn);
  const references =
    binding === undefined ? [] : (findVariable(context, binding, binding.name)?.references ?? []);
  return references.some((reference) => {
    const { identifier } = reference;
    const call = identifier.parent;
    const called = call.type === AST_NODE_TYPES.CallExpression && call.callee === identifier;
    const passed =
      call.type === AST_NODE_TYPES.CallExpression &&
      call.arguments.some((argument) => argument === identifier);
    return (
      (called && repeatedInFunction(call).repeated) || (passed && isFanOutCallback(identifier))
    );
  });
}
