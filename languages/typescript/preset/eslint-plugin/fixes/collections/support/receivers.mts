import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ts } from '../../../rules/typed/typescript-views.mts';
import { unwrapped } from '../../../rules/collections/costly-forms/repeated-runs.mts';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';

function isPlainKey(member: TSESTree.MemberExpression): boolean {
  return (
    !member.computed ||
    member.property.type === AST_NODE_TYPES.Literal ||
    member.property.type === AST_NODE_TYPES.Identifier
  );
}

export function isPlainReceiver(node: TSESTree.Node): boolean {
  let current = unwrapped(node);
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    if (current.optional || !isPlainKey(current)) {
      return false;
    }
    current = unwrapped(current.object);
  }
  return (
    current.type === AST_NODE_TYPES.Identifier || current.type === AST_NODE_TYPES.ThisExpression
  );
}

export function readsAccessor(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return true;
  }
  const checker = services.program.getTypeChecker();
  let current = unwrapped(node);
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    const symbol = checker.getSymbolAtLocation(
      services.esTreeNodeToTSNodeMap.get(current.property),
    );
    if (symbol === undefined || (symbol.flags & ts.SymbolFlags.Accessor) !== 0) {
      return true;
    }
    current = unwrapped(current.object);
  }
  return false;
}
