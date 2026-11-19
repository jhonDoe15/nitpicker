import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import { ancestorsOf, contains, nameOf, type SourceCode } from '../typed/node-views.mts';
import { ASSERTION_FORMS, unwrapOf } from '../typed/syntax-views.mts';

export type Candidate = {
  readonly node: TSESTree.NewExpression | TSESTree.CallExpression;
  readonly argument: TSESTree.Node;
};
export type Guard = { readonly text: string; readonly scope: TSESTree.Node | undefined };

const NAMED_FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
]);

export function isInsideTry(node: TSESTree.Node): boolean {
  const scope = ancestorsOf(node).find((ancestor) => NAMED_FUNCTIONS.has(ancestor.type));
  return ancestorsOf(node).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.TryStatement &&
      ancestor.handler !== null &&
      contains(ancestor.block, node) &&
      (scope === undefined || contains(scope, ancestor)),
  );
}

export function isPromiseCaught(node: TSESTree.Node): boolean {
  const handler = ancestorsOf(node).find(isFunctionNode);
  const then = handler?.parent;
  if (then?.type !== AST_NODE_TYPES.CallExpression || then.arguments[0] !== handler) {
    return false;
  }
  const { callee, parent } = then;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(callee.property) === 'then' &&
    (then.arguments.length > 1 ||
      (parent.type === AST_NODE_TYPES.MemberExpression && nameOf(parent.property) === 'catch'))
  );
}

export function isPercentTest(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Literal &&
    'regex' in callee.object &&
    callee.object.regex.pattern.includes('%') &&
    nameOf(callee.property) === 'test'
  );
}

export function functionOf(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find(
    (ancestor) => isFunctionNode(ancestor) || ancestor.type === AST_NODE_TYPES.Program,
  );
}

export function isGuarded(
  sourceCode: SourceCode,
  candidate: Candidate,
  guards: readonly Guard[],
): boolean {
  const text = sourceCode.getText(unwrapOf(candidate.argument, ASSERTION_FORMS));
  const scopes = new Set<TSESTree.Node | undefined>([
    candidate.node,
    ...ancestorsOf(candidate.node),
  ]);
  return guards.some((guard) => guard.text === text && scopes.has(guard.scope));
}
