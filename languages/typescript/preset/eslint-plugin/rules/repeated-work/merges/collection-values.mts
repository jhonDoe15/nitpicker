import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

const COLLECTIONS = new Set([
  'Array',
  'Map',
  'ReadonlyArray',
  'ReadonlyMap',
  'ReadonlySet',
  'Record',
  'Set',
]);
const KEYED = new Set(['Map', 'ReadonlyMap', 'Record']);

function typeName(node: TSESTree.TypeNode): string | undefined {
  return node.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeName.type === AST_NODE_TYPES.Identifier
    ? node.typeName.name
    : undefined;
}

function isCollectionType(node: TSESTree.TypeNode | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.TSArrayType) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.TSTypeOperator) {
    return isCollectionType(node.typeAnnotation);
  }
  return COLLECTIONS.has(typeName(node) ?? '');
}

function valueType(
  name: string | undefined,
  args: readonly TSESTree.TypeNode[] | undefined,
): TSESTree.TypeNode | undefined {
  return KEYED.has(name ?? '') && args?.length === 2 ? args[1] : undefined;
}

function declaredValueType(declarator: TSESTree.VariableDeclarator): TSESTree.TypeNode | undefined {
  const annotation = declarator.id.typeAnnotation?.typeAnnotation;
  if (annotation?.type === AST_NODE_TYPES.TSTypeReference) {
    return valueType(typeName(annotation), annotation.typeArguments?.params);
  }
  const init = declarator.init === null ? undefined : unwrapped(declarator.init);
  return init?.type === AST_NODE_TYPES.NewExpression &&
    init.callee.type === AST_NODE_TYPES.Identifier
    ? valueType(init.callee.name, init.typeArguments?.params)
    : undefined;
}

export function collectionValuedTarget(
  sourceCode: SourceCode,
  target: TSESTree.Node,
): TSESTree.VariableDeclarator | undefined {
  const value = unwrapped(target);
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const declarator = variableNamed(sourceCode, value)?.defs[0]?.node;
  return declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    isCollectionType(declaredValueType(declarator))
    ? declarator
    : undefined;
}
