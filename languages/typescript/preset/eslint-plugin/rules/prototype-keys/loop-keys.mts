import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ASSERTION_FORMS, isFunction, unwrapOf } from '../typed/syntax-views.mts';
import { nameOf } from '../typed/node-views.mts';

export type KeyLoop = {
  readonly key: string;
  readonly body: TSESTree.Node;
  readonly source: TSESTree.Node | undefined;
};

const KEY_LISTS = new Set(['keys', 'entries']);

function keyListCall(node: TSESTree.Node): TSESTree.CallExpression | undefined {
  const value = unwrapOf(node, ASSERTION_FORMS);
  return value.type === AST_NODE_TYPES.CallExpression &&
    value.callee.type === AST_NODE_TYPES.MemberExpression &&
    !value.callee.computed &&
    value.callee.object.type === AST_NODE_TYPES.Identifier &&
    value.callee.object.name === 'Object' &&
    KEY_LISTS.has(nameOf(value.callee.property) ?? '')
    ? value
    : undefined;
}

function keyNameOf(pattern: TSESTree.Node | undefined): string | undefined {
  if (pattern?.type === AST_NODE_TYPES.Identifier) {
    return pattern.name;
  }
  const [first] = pattern?.type === AST_NODE_TYPES.ArrayPattern ? pattern.elements : [];
  return first?.type === AST_NODE_TYPES.Identifier ? first.name : undefined;
}

function declaredName(left: TSESTree.Node): string | undefined {
  return left.type === AST_NODE_TYPES.VariableDeclaration
    ? keyNameOf(left.declarations.at(0)?.id)
    : undefined;
}

function forEachLoop(node: TSESTree.CallExpression): KeyLoop | undefined {
  const [callback] = node.arguments;
  const list =
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.callee.property) === 'forEach'
      ? keyListCall(node.callee.object)
      : undefined;
  const key =
    callback !== undefined && isFunction(callback) ? keyNameOf(callback.params[0]) : undefined;
  return callback !== undefined && isFunction(callback) && key !== undefined && list !== undefined
    ? { key, body: callback.body, source: list.arguments[0] }
    : undefined;
}

export function loopOf(node: TSESTree.Node): KeyLoop | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return forEachLoop(node);
  }
  if (node.type !== AST_NODE_TYPES.ForInStatement && node.type !== AST_NODE_TYPES.ForOfStatement) {
    return undefined;
  }
  const key = declaredName(node.left);
  const list = keyListCall(node.right);
  if (key === undefined || (node.type === AST_NODE_TYPES.ForOfStatement && list === undefined)) {
    return undefined;
  }
  return { key, body: node.body, source: list === undefined ? node.right : list.arguments[0] };
}
