import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { isFunction, unwrapped } from '../../typed/syntax-views.mts';

const TYPE_QUERIES = new Set([
  'getApparentType',
  'getContextualType',
  'getPropertiesOfType',
  'getResolvedSignature',
  'getSignaturesOfType',
  'getSymbolAtLocation',
  'getTypeAtLocation',
  'getTypeOfSymbol',
  'getTypeOfSymbolAtLocation',
  'typeToString',
]);
const CHECKER = /^(?:type)?checker$/iu;
const GUARD = /^(?:is|has)[A-Z]/u;
const UNSETTLED = new Set<string>([
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.UpdateExpression,
  AST_NODE_TYPES.YieldExpression,
]);

function ownerName(node: TSESTree.Node): string | undefined {
  const owner = unwrapped(node);
  if (owner.type === AST_NODE_TYPES.Identifier) {
    return owner.name;
  }
  return owner.type === AST_NODE_TYPES.MemberExpression ? memberName(owner) : undefined;
}

export function isTypeQuery(node: TSESTree.Node): boolean {
  const call = unwrapped(node);
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(call.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    TYPE_QUERIES.has(memberName(callee) ?? '') &&
    CHECKER.test(ownerName(callee.object) ?? '')
  );
}

function isGuardCall(node: TSESTree.CallExpression): boolean {
  const callee = unwrapped(node.callee);
  const name = callee.type === AST_NODE_TYPES.Identifier ? callee.name : memberName(callee);
  return (
    GUARD.test(name ?? '') &&
    node.arguments.every(
      (argument) => !someNode(argument, (child) => child.type === AST_NODE_TYPES.CallExpression),
    )
  );
}

export function isGuardTest(test: TSESTree.Node): boolean {
  return !someNode(
    test,
    (child) =>
      UNSETTLED.has(child.type) ||
      isFunction(child) ||
      (child.type === AST_NODE_TYPES.CallExpression && !isGuardCall(child)),
  );
}
