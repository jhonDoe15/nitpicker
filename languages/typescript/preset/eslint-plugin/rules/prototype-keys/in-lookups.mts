import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { ASSERTION_FORMS, unwrapOf } from '../typed/syntax-views.mts';
import { nameOf } from '../typed/node-views.mts';

function hasNullPrototype(table: TSESTree.ObjectExpression): boolean {
  return table.properties.some(
    (property) =>
      property.type === AST_NODE_TYPES.SpreadElement ||
      (!property.computed &&
        (nameOf(property.key) === '__proto__' ||
          (property.key.type === AST_NODE_TYPES.Literal && property.key.value === '__proto__'))),
  );
}

function isOpenAnnotation(annotation: TSESTree.TypeNode): boolean {
  return (
    annotation.type === AST_NODE_TYPES.TSStringKeyword ||
    annotation.type === AST_NODE_TYPES.TSAnyKeyword ||
    annotation.type === AST_NODE_TYPES.TSUnknownKeyword
  );
}

const ARRAY_CALLBACKS = new Set(['map', 'filter', 'forEach', 'some', 'every', 'find', 'flatMap']);

function iteratesConstantList(context: SourceContext, callback: TSESTree.Node): boolean {
  const call = callback.parent;
  if (
    call?.type !== AST_NODE_TYPES.CallExpression ||
    call.arguments[0] !== callback ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    !ARRAY_CALLBACKS.has(nameOf(call.callee.property) ?? '')
  ) {
    return false;
  }
  return resolveConstant(context, call.callee.object)?.type === AST_NODE_TYPES.ArrayExpression;
}

function isOpenKey(context: SourceContext, key: TSESTree.Node): boolean {
  if (key.type !== AST_NODE_TYPES.Identifier) {
    return key.type === AST_NODE_TYPES.MemberExpression;
  }
  const definitions = findVariable(context, key, key.name)?.defs ?? [];
  const [definition] = definitions;
  const name = definition?.name;
  const annotation =
    name !== undefined && 'typeAnnotation' in name
      ? name.typeAnnotation?.typeAnnotation
      : undefined;
  if (definitions.length !== 1 || definition === undefined) {
    return false;
  }
  if (annotation !== undefined) {
    return isOpenAnnotation(annotation);
  }
  return (
    definition.type === TSESLint.Scope.DefinitionType.Parameter &&
    !iteratesConstantList(context, definition.node)
  );
}

export function inLookup(context: SourceContext, node: TSESTree.BinaryExpression): boolean {
  if (node.operator !== 'in' || node.left.type === AST_NODE_TYPES.PrivateIdentifier) {
    return false;
  }
  const table = resolveConstant(context, unwrapOf(node.right, ASSERTION_FORMS));
  const key = unwrapOf(node.left, ASSERTION_FORMS);
  return (
    table?.type === AST_NODE_TYPES.ObjectExpression &&
    table.properties.length > 0 &&
    !hasNullPrototype(table) &&
    isOpenKey(context, key)
  );
}
