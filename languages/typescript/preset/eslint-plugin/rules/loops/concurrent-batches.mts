import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { nameOf, type SourceCode } from '../typed/node-views.mts';

type MethodCall = TSESTree.CallExpression & { readonly callee: TSESTree.MemberExpression };
type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const CONCURRENT_COMBINATORS = new Set(['all', 'allSettled', 'any', 'race']);

function isCombinatorCall(node: TSESTree.Node | undefined): node is MethodCall {
  const callee = node?.type === AST_NODE_TYPES.CallExpression ? node.callee : undefined;
  const method =
    callee?.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : undefined;
  return (
    callee?.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(callee.object) === 'Promise' &&
    method !== undefined &&
    CONCURRENT_COMBINATORS.has(method)
  );
}

function isCombinatorArgument(node: TSESTree.Node): boolean {
  return (
    isCombinatorCall(node.parent) && node.parent.arguments.some((argument) => argument === node)
  );
}

function isMethodCall(node: TSESTree.Node | undefined, name: string): node is MethodCall {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.callee.property) === name
  );
}

function isPushTarget(identifier: TSESTree.Node): boolean {
  const member = identifier.parent;
  return (
    member?.type === AST_NODE_TYPES.MemberExpression &&
    member.object === identifier &&
    isMethodCall(member.parent, 'push')
  );
}

function onlyCombined(
  variable: TSESLint.Scope.Variable | undefined,
  isAllowedUse: (identifier: TSESTree.Node) => boolean,
): boolean {
  const uses = variable?.references.filter((reference) => reference.init !== true) ?? [];
  const combined = uses.filter((reference) => isCombinatorArgument(reference.identifier));
  return (
    combined.length > 0 &&
    uses.every(
      (reference) =>
        isCombinatorArgument(reference.identifier) || isAllowedUse(reference.identifier),
    )
  );
}

function boundArray(
  sourceCode: SourceCode,
  declarator: TSESTree.VariableDeclarator,
): TSESLint.Scope.Variable | undefined {
  const declaration = declarator.parent;
  if (declarator.id.type !== AST_NODE_TYPES.Identifier || declaration.kind !== 'const') {
    return undefined;
  }
  return sourceCode.getDeclaredVariables(declarator)[0];
}

function mappedConstant(sourceCode: SourceCode, call: TSESTree.Node): boolean {
  const declarator = call.parent;
  if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator || declarator.init !== call) {
    return false;
  }
  return onlyCombined(boundArray(sourceCode, declarator), () => false);
}

export function isConcurrentBatch(callback: FunctionNode, sourceCode: SourceCode): boolean {
  const call = callback.parent;
  return (
    isCombinatorCall(call.parent) || (isMethodCall(call, 'map') && mappedConstant(sourceCode, call))
  );
}

export function isPushedForConcurrency(call: TSESTree.Node, sourceCode: SourceCode): boolean {
  const push = call.parent;
  if (!(isMethodCall(push, 'push') && push.arguments.some((argument) => argument === call))) {
    return false;
  }
  const target = push.callee.object;
  if (target.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  return onlyCombined(findVariable({ sourceCode }, target, target.name), isPushTarget);
}
