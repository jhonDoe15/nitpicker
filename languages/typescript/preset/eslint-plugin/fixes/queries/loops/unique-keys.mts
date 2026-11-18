import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';
import { constDefinition } from '../../../rules/typed/syntax-views.mts';

function isNamed(node: TSESTree.Node, owner: string, method: string): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    node.object.name === owner &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === method
  );
}

function hasTypeNamed(context: Context, node: TSESTree.Node, names: readonly string[]): boolean {
  const type = typeServices(context)?.getTypeAtLocation(node);
  return names.includes(type?.getSymbol()?.getName() ?? '');
}

function isUniqueKeys(context: Context, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return (
      node.callee.type === AST_NODE_TYPES.Identifier && ['Set', 'Map'].includes(node.callee.name)
    );
  }
  if (node.type === AST_NODE_TYPES.Identifier) {
    return hasTypeNamed(context, node, ['Set', 'Map']);
  }
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'keys' &&
    hasTypeNamed(context, node.callee.object, ['Set', 'Map'])
  );
}

function isUniqueList(context: Context, node: TSESTree.Node | undefined): boolean {
  if (node?.type === AST_NODE_TYPES.ArrayExpression) {
    const [only] = node.elements;
    return (
      node.elements.length === 1 &&
      only?.type === AST_NODE_TYPES.SpreadElement &&
      isUniqueKeys(context, only.argument)
    );
  }
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const [argument] = node.arguments;
  if (isNamed(node.callee, 'Object', 'keys')) {
    return true;
  }
  return (
    isNamed(node.callee, 'Array', 'from') &&
    node.arguments.length === 1 &&
    argument !== undefined &&
    isUniqueKeys(context, argument)
  );
}

export function hasUniqueKeys(context: Context, iterable: TSESTree.Node): boolean {
  if (iterable.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = constDefinition(context, iterable);
  return definition !== undefined && isUniqueList(context, definition.node.init ?? undefined);
}
