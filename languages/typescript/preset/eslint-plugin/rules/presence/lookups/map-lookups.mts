import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import type { TypedFacts as Facts } from '../../promises/cannot-reject.mts';
import { depthFirst, nameOf, variableNamed } from '../../typed/node-views.mts';
import { isReference } from '../../typed/typescript-views.mts';
import { syntaxChildren } from '../../decided/syntax.mts';
import { plainText } from '../conditions.mts';

export type Lookup = {
  readonly receiver: TSESTree.Expression;
  readonly key: TSESTree.Node;
  readonly valueType: TypeScript.Type;
};

const MAPS = new Set(['Map', 'WeakMap', 'ReadonlyMap']);

export function unwrap(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (
    current.type === AST_NODE_TYPES.ChainExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression ||
    current.type === AST_NODE_TYPES.TSAsExpression
  ) {
    current = current.expression;
  }
  return current;
}

function methodCall(node: TSESTree.Node, name: string): TSESTree.CallExpression | undefined {
  const call = unwrap(node);
  return call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    !call.callee.computed &&
    nameOf(call.callee.property) === name &&
    call.arguments.length >= 1 &&
    call.arguments[0]?.type !== AST_NODE_TYPES.SpreadElement
    ? call
    : undefined;
}

function mapValueType(scope: Facts, receiver: TSESTree.Node): TypeScript.Type | undefined {
  const { services } = scope;
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(receiver));
  const name = type.getSymbol()?.getName();
  if (name === undefined || !MAPS.has(name) || !isReference(type)) {
    return undefined;
  }
  return checker.getTypeArguments(type)[1];
}

export function lookupOf(scope: Facts, node: TSESTree.Node): Lookup | undefined {
  const call = methodCall(node, 'get');
  if (call === undefined || call.arguments.length !== 1) {
    return undefined;
  }
  const { callee } = call;
  const key = call.arguments[0];
  const valueType =
    callee.type === AST_NODE_TYPES.MemberExpression && key !== undefined
      ? mapValueType(scope, callee.object)
      : undefined;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    key !== undefined &&
    valueType !== undefined
    ? { receiver: callee.object, key, valueType }
    : undefined;
}

export function boundLookup(scope: Facts, node: TSESTree.Node): Lookup | undefined {
  const target = unwrap(node);
  if (target.type !== AST_NODE_TYPES.Identifier) {
    return lookupOf(scope, target);
  }
  const definition = variableNamed(scope.sourceCode, target)?.defs.at(0);
  const declarator = definition?.node;
  return declarator?.type === AST_NODE_TYPES.VariableDeclarator && declarator.init !== null
    ? lookupOf(scope, declarator.init)
    : undefined;
}

export function storeCalls(
  scope: Facts,
  region: readonly TSESTree.Node[],
  lookup: Lookup,
): TSESTree.CallExpression[] {
  const receiver = plainText(lookup.receiver, scope.sourceCode);
  const key = plainText(lookup.key, scope.sourceCode);
  return region
    .flatMap((root) => [...depthFirst<TSESTree.Node>(root, syntaxChildren)])
    .filter(
      (candidate): candidate is TSESTree.CallExpression =>
        methodCall(candidate, 'set') === candidate &&
        candidate.type === AST_NODE_TYPES.CallExpression &&
        candidate.callee.type === AST_NODE_TYPES.MemberExpression &&
        plainText(candidate.callee.object, scope.sourceCode) === receiver &&
        plainText(candidate.arguments[0] ?? candidate, scope.sourceCode) === key,
    );
}
