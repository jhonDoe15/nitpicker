import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../../analysis/constant-resolution.mts';

export { patternNames } from '../support/ast-walk.mts';

const UNIQUE_ITERABLE_METHODS = new Set(['keys', 'entries']);

function isUniqueCall(context: SourceContext, call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    if (UNIQUE_ITERABLE_METHODS.has(callee.property.name)) {
      return true;
    }
    if (
      callee.object.type === AST_NODE_TYPES.Identifier &&
      callee.object.name === 'Array' &&
      callee.property.name === 'from'
    ) {
      return isUniqueOrLiteralIterable(context, call.arguments[0]);
    }
  }
  return false;
}

export function isUniqueOrLiteralIterable(
  context: SourceContext,
  node: TSESTree.Node | undefined,
): boolean {
  const resolved = resolveConstant(context, node);
  if (resolved === undefined || resolved.type === AST_NODE_TYPES.ArrayExpression) {
    return true;
  }
  if (
    resolved.type === AST_NODE_TYPES.NewExpression &&
    resolved.callee.type === AST_NODE_TYPES.Identifier &&
    resolved.callee.name === 'Set'
  ) {
    return true;
  }
  return resolved.type === AST_NODE_TYPES.CallExpression && isUniqueCall(context, resolved);
}
