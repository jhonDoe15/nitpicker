import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { hasTypeInformation } from '../promises/cannot-reject.mts';
import { chainOf, variableNamed, type SourceCode } from '../typed/node-views.mts';
import { memberName } from '../analysis/test-code-analysis.mts';

const { DefinitionType } = TSESLint.Scope;

function isWrapper(
  node: TSESTree.Node,
): node is
  | TSESTree.ChainExpression
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSTypeAssertion {
  return (
    node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion
  );
}
const ARRAY_METHODS = new Set<string>([
  'concat',
  'filter',
  'flat',
  'flatMap',
  'map',
  'slice',
  'toReversed',
  'toSorted',
  'toSpliced',
]);
const ARRAY_STATICS = new Map<string, ReadonlySet<string>>([
  ['Array', new Set(['from', 'of'])],
  ['Object', new Set(['entries', 'keys', 'values'])],
  ['Promise', new Set(['all', 'allSettled'])],
]);

function innerOf(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return node.argument;
  }
  return isWrapper(node) ? node.expression : undefined;
}

export function unwrapped(node: TSESTree.Node): TSESTree.Node {
  return chainOf(node, innerOf).at(-1) ?? node;
}

function isArrayCall(call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const name = memberName(callee);
  const owner = unwrapped(callee.object);
  if (owner.type === AST_NODE_TYPES.Identifier && ARRAY_STATICS.has(owner.name)) {
    return ARRAY_STATICS.get(owner.name)?.has(name ?? '') === true;
  }
  return ARRAY_METHODS.has(name ?? '');
}

function initializerOf(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Node | undefined {
  const value = unwrapped(node);
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = variableNamed(sourceCode, value)?.defs[0];
  return definition?.type === DefinitionType.Variable
    ? (definition.node.init ?? undefined)
    : undefined;
}

function isArrayValue(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  return (
    value.type === AST_NODE_TYPES.ArrayExpression ||
    (value.type === AST_NODE_TYPES.CallExpression && isArrayCall(value))
  );
}

function isArrayExpression(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const visited = new Set<TSESTree.Node | undefined>();
  const chain = chainOf<TSESTree.Node>(node, (current) => {
    visited.add(current);
    const next = initializerOf(sourceCode, current);
    return visited.has(next) ? undefined : next;
  });
  const last = chain.at(-1);
  return last !== undefined && isArrayValue(last);
}

function hasArrayType(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const services = sourceCode.parserServices;
  if (!hasTypeInformation(services)) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
  return checker.isArrayType(type) || checker.isTupleType(type);
}

export function isStreamSource(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  return !(isArrayExpression(sourceCode, node) || hasArrayType(sourceCode, node));
}
