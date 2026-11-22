import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

const COLLECTION_TYPE_NAMES = new Set([
  'Set',
  'ReadonlySet',
  'Array',
  'ReadonlyArray',
  'Map',
  'ReadonlyMap',
]);
const MAP_TYPE_NAMES = new Set(['Map', 'ReadonlyMap', 'Record']);
const ITERABLE_TYPE_NAMES = new Set(['Array', 'ReadonlyArray', 'Iterable', 'Set', 'ReadonlySet']);
const COLLECTION_CONSTRUCTORS = new Set(['Set', 'Map']);

function typeNameOf(typeNode: TSESTree.TSTypeReference): string | undefined {
  return typeNode.typeName.type === AST_NODE_TYPES.Identifier ? typeNode.typeName.name : undefined;
}

export function isCollectionType(typeNode: TSESTree.TypeNode | undefined): boolean {
  if (typeNode === undefined) {
    return false;
  }
  if (
    typeNode.type === AST_NODE_TYPES.TSArrayType ||
    typeNode.type === AST_NODE_TYPES.TSTupleType
  ) {
    return true;
  }
  if (typeNode.type === AST_NODE_TYPES.TSTypeOperator) {
    return isCollectionType(typeNode.typeAnnotation);
  }
  if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
    return COLLECTION_TYPE_NAMES.has(typeNameOf(typeNode) ?? '');
  }
  return typeNode.type === AST_NODE_TYPES.TSUnionType && typeNode.types.some(isCollectionType);
}

export function isCollectionMapType(typeNode: TSESTree.TypeNode | undefined): boolean {
  if (typeNode === undefined) {
    return false;
  }
  if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
    const name = typeNameOf(typeNode);
    const params = typeNode.typeArguments?.params ?? [];
    return name !== undefined && MAP_TYPE_NAMES.has(name) && isCollectionType(params[1]);
  }
  if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
    return typeNode.members.some(
      (member) =>
        member.type === AST_NODE_TYPES.TSIndexSignature &&
        isCollectionType(member.typeAnnotation?.typeAnnotation),
    );
  }
  return false;
}

function iterableElementType(
  typeNode: TSESTree.TypeNode | undefined,
): TSESTree.TypeNode | undefined {
  if (typeNode === undefined) {
    return undefined;
  }
  if (typeNode.type === AST_NODE_TYPES.TSArrayType) {
    return typeNode.elementType;
  }
  if (typeNode.type === AST_NODE_TYPES.TSTypeOperator) {
    return iterableElementType(typeNode.typeAnnotation);
  }
  if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
    const name = typeNameOf(typeNode);
    return name !== undefined && ITERABLE_TYPE_NAMES.has(name)
      ? typeNode.typeArguments?.params[0]
      : undefined;
  }
  return undefined;
}

function initializerMapType(init: TSESTree.Expression | null): TSESTree.TypeNode | undefined {
  if (
    init !== null &&
    (init.type === AST_NODE_TYPES.TSAsExpression ||
      init.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      init.type === AST_NODE_TYPES.TSTypeAssertion)
  ) {
    return init.typeAnnotation;
  }
  return undefined;
}

function declaredTypeOf(node: TSESTree.Node): TSESTree.TypeNode | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.typeAnnotation?.typeAnnotation;
  }
  if (node.type === AST_NODE_TYPES.VariableDeclarator) {
    if (node.id.type === AST_NODE_TYPES.Identifier && node.id.typeAnnotation !== undefined) {
      return node.id.typeAnnotation.typeAnnotation;
    }
    return initializerMapType(node.init);
  }
  return undefined;
}

function newMapHasCollectionValue(init: TSESTree.Expression | null): boolean {
  if (init === null) {
    return false;
  }
  const value = unwrapped(init);
  return (
    value.type === AST_NODE_TYPES.NewExpression &&
    value.callee.type === AST_NODE_TYPES.Identifier &&
    value.callee.name === 'Map' &&
    isCollectionType(value.typeArguments?.params[1])
  );
}

function declaredTypeOfDefinition(def: TSESLint.Scope.Definition): TSESTree.TypeNode | undefined {
  if (def.name.type === AST_NODE_TYPES.Identifier && def.name.typeAnnotation !== undefined) {
    return def.name.typeAnnotation.typeAnnotation;
  }
  return declaredTypeOf(def.node);
}

export function isCollectionMapVariable(sourceCode: SourceCode, id: TSESTree.Identifier): boolean {
  const def = variableNamed(sourceCode, id)?.defs[0];
  if (def === undefined) {
    return false;
  }
  if (isCollectionMapType(declaredTypeOfDefinition(def))) {
    return true;
  }
  return (
    def.node.type === AST_NODE_TYPES.VariableDeclarator && newMapHasCollectionValue(def.node.init)
  );
}

export function isCollectionExpression(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return true;
  }
  return (
    value.type === AST_NODE_TYPES.NewExpression &&
    value.callee.type === AST_NODE_TYPES.Identifier &&
    COLLECTION_CONSTRUCTORS.has(value.callee.name)
  );
}

function loopIterable(loop: TSESTree.Node): TSESTree.Node | undefined {
  if (loop.type === AST_NODE_TYPES.ForOfStatement) {
    return loop.right;
  }
  if (
    (loop.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      loop.type === AST_NODE_TYPES.FunctionExpression) &&
    loop.parent?.type === AST_NODE_TYPES.CallExpression
  ) {
    const callee = unwrapped(loop.parent.callee);
    return callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  }
  return undefined;
}

export function outerLoopHasCollectionMapElements(
  sourceCode: SourceCode,
  loop: TSESTree.Node,
): boolean {
  const iterable = loopIterable(loop);
  if (iterable?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const def = variableNamed(sourceCode, iterable)?.defs[0];
  return (
    def !== undefined && isCollectionMapType(iterableElementType(declaredTypeOfDefinition(def)))
  );
}
