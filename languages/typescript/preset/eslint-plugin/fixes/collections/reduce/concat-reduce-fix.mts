import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Callback } from '../../../rules/typed/syntax-views.mts';
import { hasSingleType } from '../../../rules/support/array-items.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { replacing, type FixPlan } from '../../support/ranges.mts';
import { asExpressionBody, expressionText, reduceSite, rewrittenCall } from './reduce-site.mts';
import { hasMethod, isPlainConcatArgument } from './type-proofs.mts';

function isOnlyConcat(
  node: TSESTree.Node,
  accumulator: TSESTree.Node | undefined,
): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    !callee.optional &&
    !node.optional &&
    node.typeArguments === undefined &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'concat' &&
    callee.object === accumulator &&
    node.arguments.length === 1 &&
    node.arguments[0]?.type !== AST_NODE_TYPES.SpreadElement
  );
}

export function concatReduceFix(context: Context, callback: Callback): FixPlan | undefined {
  const site = reduceSite(context, callback, 'array');
  if (
    site === undefined ||
    !isOnlyConcat(site.result, site.accumulator.references[0]?.identifier)
  ) {
    return undefined;
  }
  const [argument] = site.result.arguments;
  if (
    argument === undefined ||
    !hasSingleType(context, argument) ||
    !isPlainConcatArgument(context, argument) ||
    !hasMethod(context, site.receiver, 'flatMap')
  ) {
    return undefined;
  }
  const result = asExpressionBody(site, expressionText(context.sourceCode, argument));
  return replacing(
    site.call.range,
    rewrittenCall(context.sourceCode, site, { method: 'flatMap', result }),
  );
}
