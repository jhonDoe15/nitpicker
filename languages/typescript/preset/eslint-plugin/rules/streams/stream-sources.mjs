import { chainOf, variableNamed } from '../analysis/ancestry.mjs';
import { memberName } from '../analysis/test-code-analysis.mjs';

const WRAPPERS = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);
const ARRAY_METHODS = new Set([
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
const ARRAY_STATICS = new Map([
  ['Array', new Set(['from', 'of'])],
  ['Object', new Set(['entries', 'keys', 'values'])],
  ['Promise', new Set(['all', 'allSettled'])],
]);

function innerOf(node) {
  if (node.type === 'AwaitExpression') {
    return node.argument;
  }
  return WRAPPERS.has(node.type) ? node.expression : undefined;
}

export function unwrapped(node) {
  return chainOf(node, innerOf).at(-1);
}

function isArrayCall(call) {
  const callee = unwrapped(call.callee);
  if (callee.type !== 'MemberExpression') {
    return false;
  }
  const name = memberName(callee);
  const owner = unwrapped(callee.object);
  if (owner.type === 'Identifier' && ARRAY_STATICS.has(owner.name)) {
    return ARRAY_STATICS.get(owner.name).has(name);
  }
  return ARRAY_METHODS.has(name);
}

function initializerOf(sourceCode, node) {
  const value = unwrapped(node);
  if (value.type !== 'Identifier') {
    return undefined;
  }
  const definition = variableNamed(sourceCode, value)?.defs[0];
  return definition?.type === 'Variable' ? (definition.node.init ?? undefined) : undefined;
}

function isArrayValue(node) {
  const value = unwrapped(node);
  return (
    value.type === 'ArrayExpression' || (value.type === 'CallExpression' && isArrayCall(value))
  );
}

function isArrayExpression(sourceCode, node) {
  const visited = new Set();
  const chain = chainOf(node, (current) => {
    visited.add(current);
    const next = initializerOf(sourceCode, current);
    return visited.has(next) ? undefined : next;
  });
  return isArrayValue(chain.at(-1));
}

function hasArrayType(sourceCode, node) {
  const services = sourceCode.parserServices;
  if (services?.program === null || services?.program === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
  return checker.isArrayType(type) || checker.isTupleType(type);
}

export function isStreamSource(sourceCode, node) {
  return !(isArrayExpression(sourceCode, node) || hasArrayType(sourceCode, node));
}
