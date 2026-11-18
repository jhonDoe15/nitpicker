import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { ASSERTION_FORMS, unwrapOf } from '../typed/syntax-views.mts';

export type SplitCall = {
  readonly call: TSESTree.CallExpression;
  readonly receiver: TSESTree.Node;
  readonly separator: string;
  readonly limited: boolean;
};

const NULLISH_FALLBACKS = new Set(['??', '||']);

export function unchained(node: TSESTree.Node): TSESTree.Node {
  const inner = unwrapOf(node, ASSERTION_FORMS);
  if (inner.type === AST_NODE_TYPES.ChainExpression) {
    return unchained(inner.expression);
  }
  if (inner.type === AST_NODE_TYPES.LogicalExpression && NULLISH_FALLBACKS.has(inner.operator)) {
    return unchained(inner.left);
  }
  return inner;
}

export function splitCallOf(context: SourceContext, node: TSESTree.Node): SplitCall | undefined {
  const call = unchained(node);
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    call.callee.computed ||
    call.callee.property.type !== AST_NODE_TYPES.Identifier ||
    call.callee.property.name !== 'split'
  ) {
    return undefined;
  }
  const [first, limit] = call.arguments;
  const separator = stringValue(first === undefined ? undefined : resolveConstant(context, first));
  return separator === undefined || call.arguments.length > 2
    ? undefined
    : { call, receiver: call.callee.object, separator, limited: limit !== undefined };
}

export function constantText(context: SourceContext, node: TSESTree.Node): string | undefined {
  return stringValue(resolveConstant(context, node));
}
