import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, resolveFunction } from '../../../rules/analysis/constant-resolution.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { containsNode } from '../../support/nodes.mts';

export type MapShape = {
  readonly receiver: TSESTree.Node;
  readonly callback: TSESTree.Node;
  readonly mapCall: TSESTree.CallExpression;
};

type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

export function mapShape(call: TSESTree.CallExpression): MapShape | undefined {
  const [mapCall] = call.arguments;
  if (call.arguments.length !== 1 || mapCall?.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const { callee } = mapCall;
  const [callback] = mapCall.arguments;
  const isMap =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    !callee.optional &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'map';
  if (
    !isMap ||
    mapCall.optional ||
    mapCall.arguments.length !== 1 ||
    callback === undefined ||
    callback.type === AST_NODE_TYPES.SpreadElement
  ) {
    return undefined;
  }
  return { receiver: callee.object, callback, mapCall };
}

function isArrayConstruction(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.NewExpression || node.type === AST_NODE_TYPES.CallExpression) &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Array'
  );
}

export function mayBeSparse(receiver: TSESTree.Node): boolean {
  let current: TSESTree.Node = receiver;
  for (;;) {
    if (isArrayConstruction(current)) {
      return true;
    }
    if (current.type === AST_NODE_TYPES.ArrayExpression) {
      return current.elements.some((element) => element === null);
    }
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      current = current.object;
    } else if (
      current.type === AST_NODE_TYPES.CallExpression &&
      current.callee.type === AST_NODE_TYPES.MemberExpression
    ) {
      current = current.callee.object;
    } else {
      return false;
    }
  }
}

function usesCallerState(context: Context, fn: FunctionNode): boolean {
  return (
    fn.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    containsNode(context.sourceCode, fn.body, {
      intoFunctions: true,
      matches: (node) =>
        node.type === AST_NODE_TYPES.ThisExpression ||
        (node.type === AST_NODE_TYPES.Identifier && node.name === 'arguments'),
    })
  );
}

function takesOnlyTheItem(fn: FunctionNode): boolean {
  const [first] = fn.params;
  return fn.params.length <= 1 && first?.type !== AST_NODE_TYPES.RestElement;
}

export function callbackFunction(
  context: Context,
  callback: TSESTree.Node,
): FunctionNode | undefined {
  const resolved = isFunctionNode(callback) ? callback : resolveFunction(context, callback);
  return isFunctionNode(resolved) &&
    takesOnlyTheItem(resolved) &&
    !usesCallerState(context, resolved)
    ? resolved
    : undefined;
}
