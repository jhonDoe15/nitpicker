import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, someNode } from '../../collections/costly-forms/repeated-runs.mts';
import {
  constantInitializer,
  contains,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { REPEATING_FIELDS, type ItemLoop } from './loop-context.mts';
import { isJsonParseCall, localFunctionFor, PURE_TEXT_METHODS } from './parse-constants.mts';
import { isPureTextParser } from './pure-parser.mts';

const MEMO_METHODS = new Set(['get', 'has']);

function localConstInLoop(
  sourceCode: SourceCode,
  id: TSESTree.Identifier,
  loop: ItemLoop,
): TSESTree.Expression | undefined {
  const variable = variableNamed(sourceCode, id);
  const def = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (def === undefined || !contains(loop.body, def.name)) {
    return undefined;
  }
  return constantInitializer(sourceCode, id);
}

function isIndexedItem(node: TSESTree.Node, loop: ItemLoop): boolean {
  const value = unwrapped(node);
  if (
    loop.listName === undefined ||
    loop.indexName === undefined ||
    value.type !== AST_NODE_TYPES.MemberExpression ||
    !value.computed
  ) {
    return false;
  }
  const object = unwrapped(value.object);
  const property = unwrapped(value.property);
  return (
    object.type === AST_NODE_TYPES.Identifier &&
    object.name === loop.listName &&
    property.type === AST_NODE_TYPES.Identifier &&
    property.name === loop.indexName
  );
}

function matchesItem(sourceCode: SourceCode, node: TSESTree.Node, loop: ItemLoop): boolean {
  const value = unwrapped(node);
  if (isIndexedItem(value, loop)) {
    return true;
  }
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  if (loop.itemName !== undefined && value.name === loop.itemName) {
    return true;
  }
  const init = localConstInLoop(sourceCode, value, loop);
  return init !== undefined && isIndexedItem(init, loop);
}

export function directFieldName(
  sourceCode: SourceCode,
  node: TSESTree.Node | undefined,
  loop: ItemLoop,
): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.Identifier) {
    const destructured = loop.destructuredFields.get(value.name);
    if (destructured !== undefined) {
      return destructured;
    }
    const init = localConstInLoop(sourceCode, value, loop);
    return init === undefined ? undefined : directFieldName(sourceCode, init, loop);
  }
  if (value.type !== AST_NODE_TYPES.MemberExpression || value.computed) {
    return undefined;
  }
  const field = memberName(value);
  return field !== undefined &&
    REPEATING_FIELDS.has(field) &&
    matchesItem(sourceCode, value.object, loop)
    ? field
    : undefined;
}

function parsedCallFieldName(
  sourceCode: SourceCode,
  value: TSESTree.CallExpression,
  loop: ItemLoop,
): string | undefined {
  if (isJsonParseCall(sourceCode, value)) {
    return parsedFieldName(sourceCode, value.arguments[0], loop);
  }
  const callee = unwrapped(value.callee);
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    const method = memberName(callee);
    if (method === 'exec') {
      return parsedFieldName(sourceCode, value.arguments[0], loop);
    }
    return method !== undefined && PURE_TEXT_METHODS.has(method)
      ? parsedFieldName(sourceCode, callee.object, loop)
      : undefined;
  }
  const localFn = localFunctionFor(sourceCode, callee);
  return localFn !== undefined && isPureTextParser(sourceCode, localFn)
    ? parsedFieldName(sourceCode, value.arguments[0], loop)
    : undefined;
}

export function parsedFieldName(
  sourceCode: SourceCode,
  node: TSESTree.Node | undefined,
  loop: ItemLoop,
): string | undefined {
  const direct = directFieldName(sourceCode, node, loop);
  if (direct !== undefined) {
    return direct;
  }
  const value = node === undefined ? undefined : unwrapped(node);
  return value?.type === AST_NODE_TYPES.CallExpression
    ? parsedCallFieldName(sourceCode, value, loop)
    : undefined;
}

function objectHasOwnField(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  loop: ItemLoop,
): string | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || memberName(callee) !== 'hasOwn') {
    return undefined;
  }
  const owner = unwrapped(callee.object);
  return owner.type === AST_NODE_TYPES.Identifier && owner.name === 'Object'
    ? directFieldName(sourceCode, call.arguments[1], loop)
    : undefined;
}

export function isCachedInLoop(sourceCode: SourceCode, loop: ItemLoop, field: string): boolean {
  return someNode(loop.body, (node) => {
    if (node.type === AST_NODE_TYPES.CallExpression) {
      const callee = unwrapped(node.callee);
      const isMemoMethod =
        callee.type === AST_NODE_TYPES.MemberExpression &&
        MEMO_METHODS.has(memberName(callee) ?? '') &&
        node.arguments.some((arg) => directFieldName(sourceCode, arg, loop) === field);
      return isMemoMethod || objectHasOwnField(sourceCode, node, loop) === field;
    }
    if (node.type === AST_NODE_TYPES.MemberExpression && node.computed) {
      return directFieldName(sourceCode, node.property, loop) === field;
    }
    return (
      node.type === AST_NODE_TYPES.BinaryExpression &&
      node.operator === 'in' &&
      directFieldName(sourceCode, node.left, loop) === field
    );
  });
}
