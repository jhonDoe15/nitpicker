import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../../rules/analysis/constant-resolution.mts';
import { typeServices, unwrapped, type Context } from '../../../rules/security/security-values.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';
import type TypeScript from 'typescript';

const PATH_MODULES = new Set(['path', 'node:path']);
const PATH_BUILDERS = new Set(['join', 'resolve']);
const PATH_OBJECTS = new Set(['Buffer', 'URL']);

function isPathType(type: TypeScript.Type): boolean {
  if (type.isUnion()) {
    return type.types.every(isPathType);
  }
  if ((type.flags & ts.TypeFlags.StringLike) !== 0) {
    return true;
  }
  const name = type.symbol?.name;
  return (type.flags & ts.TypeFlags.Object) !== 0 && name !== undefined && PATH_OBJECTS.has(name);
}

function importSource(context: Context, node: TSESTree.Identifier): string | undefined {
  const definition = findVariable(context, node, node.name)?.defs[0];
  if (definition?.type !== 'ImportBinding') {
    return undefined;
  }
  const { parent } = definition.node;
  return parent.type === AST_NODE_TYPES.ImportDeclaration ? String(parent.source.value) : undefined;
}

function importedName(context: Context, node: TSESTree.Identifier): string | undefined {
  const definition = findVariable(context, node, node.name)?.defs[0];
  return definition?.type === 'ImportBinding' &&
    definition.node.type === AST_NODE_TYPES.ImportSpecifier &&
    definition.node.imported.type === AST_NODE_TYPES.Identifier
    ? definition.node.imported.name
    : undefined;
}

function isPathBuilderCall(context: Context, call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const source = importSource(context, callee);
    const name = importedName(context, callee);
    return (
      source !== undefined &&
      PATH_MODULES.has(source) &&
      name !== undefined &&
      PATH_BUILDERS.has(name)
    );
  }
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.object.type !== AST_NODE_TYPES.Identifier ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const source = importSource(context, callee.object);
  return (
    source !== undefined && PATH_MODULES.has(source) && PATH_BUILDERS.has(callee.property.name)
  );
}

function looksLikePath(context: Context, node: TSESTree.Node): boolean {
  switch (node.type) {
    case AST_NODE_TYPES.Literal:
      return typeof node.value === 'string';
    case AST_NODE_TYPES.TemplateLiteral:
      return true;
    case AST_NODE_TYPES.NewExpression:
      return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'URL';
    case AST_NODE_TYPES.CallExpression:
      return isPathBuilderCall(context, node);
    default:
      return false;
  }
}

export function mayBeDescriptor(context: Context, argument: TSESTree.Node): boolean {
  const target = unwrapped(argument);
  const services = typeServices(context);
  if (services === undefined) {
    return !looksLikePath(context, target);
  }
  return !isPathType(services.getTypeAtLocation(target));
}
