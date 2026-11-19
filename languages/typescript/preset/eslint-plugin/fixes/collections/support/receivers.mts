import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ts } from '../../../rules/typed/typescript-views.mts';
import { memberChain } from '../../../rules/collections/costly-forms/repeated-runs.mts';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';

function isPlainKey(member: TSESTree.MemberExpression): boolean {
  return (
    !member.computed ||
    member.property.type === AST_NODE_TYPES.Literal ||
    member.property.type === AST_NODE_TYPES.Identifier
  );
}

export function isPlainReceiver(node: TSESTree.Node): boolean {
  const chain = memberChain(node);
  const base = chain.at(-1);
  return (
    chain.every(
      (link) =>
        link.type !== AST_NODE_TYPES.MemberExpression || (!link.optional && isPlainKey(link)),
    ) &&
    (base?.type === AST_NODE_TYPES.Identifier || base?.type === AST_NODE_TYPES.ThisExpression)
  );
}

export function readsAccessor(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return true;
  }
  const checker = services.program.getTypeChecker();
  return memberChain(node)
    .flatMap((link) => (link.type === AST_NODE_TYPES.MemberExpression ? [link] : []))
    .some((member) => {
      const symbol = checker.getSymbolAtLocation(
        services.esTreeNodeToTSNodeMap.get(member.property),
      );
      return symbol === undefined || (symbol.flags & ts.SymbolFlags.Accessor) !== 0;
    });
}
