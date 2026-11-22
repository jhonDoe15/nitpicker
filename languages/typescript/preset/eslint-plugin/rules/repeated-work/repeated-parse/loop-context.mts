import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  calledMember,
  memberName,
  outerOf,
} from '../../collections/costly-forms/repeated-runs.mts';
import { ancestorsOf, type SourceCode } from '../../typed/node-views.mts';
import { isFunction, unwrapped } from '../../typed/syntax-views.mts';
import { isBoundedList } from '../materialize/unbounded-source.mts';

export const REPEATING_FIELDS = new Set([
  'body',
  'category',
  'code',
  'file',
  'format',
  'header',
  'kind',
  'label',
  'message',
  'path',
  'pattern',
  'rule',
  'source',
  'template',
  'tool',
  'type',
  'url',
]);

const CALLBACK_METHODS = new Set(['filter', 'flatMap', 'forEach', 'map', 'reduce']);

export type ItemLoop = {
  readonly body: TSESTree.Node;
  readonly itemName: string | undefined;
  readonly listName: string | undefined;
  readonly indexName: string | undefined;
  readonly destructuredFields: ReadonlyMap<string, string>;
};

function destructuredFieldMap(pattern: TSESTree.ObjectPattern): Map<string, string> {
  const fields = new Map<string, string>();
  for (const prop of pattern.properties) {
    if (
      prop.type === AST_NODE_TYPES.Property &&
      !prop.computed &&
      prop.key.type === AST_NODE_TYPES.Identifier &&
      prop.value.type === AST_NODE_TYPES.Identifier &&
      REPEATING_FIELDS.has(prop.key.name)
    ) {
      fields.set(prop.value.name, prop.key.name);
    }
  }
  return fields;
}

function bindingFromPattern(pattern: TSESTree.Node | undefined): {
  readonly itemName: string | undefined;
  readonly destructuredFields: Map<string, string>;
} {
  if (pattern?.type === AST_NODE_TYPES.Identifier) {
    return { itemName: pattern.name, destructuredFields: new Map() };
  }
  if (pattern?.type === AST_NODE_TYPES.ObjectPattern) {
    return { itemName: undefined, destructuredFields: destructuredFieldMap(pattern) };
  }
  return { itemName: undefined, destructuredFields: new Map() };
}

function forOfLoop(sourceCode: SourceCode, node: TSESTree.ForOfStatement): ItemLoop | undefined {
  if (isBoundedList(sourceCode, node.right)) {
    return undefined;
  }
  const target =
    node.left.type === AST_NODE_TYPES.VariableDeclaration
      ? node.left.declarations[0]?.id
      : node.left;
  const binding = bindingFromPattern(target);
  if (binding.itemName === undefined && binding.destructuredFields.size === 0) {
    return undefined;
  }
  return {
    body: node.body,
    itemName: binding.itemName,
    listName: undefined,
    indexName: undefined,
    destructuredFields: binding.destructuredFields,
  };
}

function forIndexLoop(sourceCode: SourceCode, node: TSESTree.ForStatement): ItemLoop | undefined {
  const { test } = node;
  if (test?.type !== AST_NODE_TYPES.BinaryExpression || test.operator !== '<') {
    return undefined;
  }
  const left = unwrapped(test.left);
  const right = unwrapped(test.right);
  if (
    left.type !== AST_NODE_TYPES.Identifier ||
    right.type !== AST_NODE_TYPES.MemberExpression ||
    memberName(right) !== 'length' ||
    isBoundedList(sourceCode, right.object)
  ) {
    return undefined;
  }
  const list = unwrapped(right.object);
  if (list.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  return {
    body: node.body,
    itemName: undefined,
    listName: list.name,
    indexName: left.name,
    destructuredFields: new Map(),
  };
}

function callbackMethodOf(sourceCode: SourceCode, fn: TSESTree.Node): string | undefined {
  const outer = outerOf(fn);
  const call = outer.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.arguments[0] !== outer) {
    return undefined;
  }
  const member = calledMember(call);
  const method = member === undefined ? undefined : memberName(member);
  if (
    member === undefined ||
    method === undefined ||
    !CALLBACK_METHODS.has(method) ||
    isBoundedList(sourceCode, member.object)
  ) {
    return undefined;
  }
  return method;
}

function callbackLoop(sourceCode: SourceCode, fn: TSESTree.Node): ItemLoop | undefined {
  if (!isFunction(fn)) {
    return undefined;
  }
  const method = callbackMethodOf(sourceCode, fn);
  if (method === undefined) {
    return undefined;
  }
  const binding = bindingFromPattern(fn.params[method === 'reduce' ? 1 : 0]);
  if (binding.itemName === undefined && binding.destructuredFields.size === 0) {
    return undefined;
  }
  return {
    body: fn.body,
    itemName: binding.itemName,
    listName: undefined,
    indexName: undefined,
    destructuredFields: binding.destructuredFields,
  };
}

export function enclosingItemLoop(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): ItemLoop | undefined {
  const chain = [node, ...ancestorsOf(node)];
  for (const [index, ancestor] of chain.entries()) {
    const child = chain[index - 1];
    if (ancestor.type === AST_NODE_TYPES.ForOfStatement && child === ancestor.body) {
      return forOfLoop(sourceCode, ancestor);
    }
    if (ancestor.type === AST_NODE_TYPES.ForStatement && child === ancestor.body) {
      return forIndexLoop(sourceCode, ancestor);
    }
    if (index > 0 && isFunction(ancestor)) {
      return callbackLoop(sourceCode, ancestor);
    }
  }
  return undefined;
}
