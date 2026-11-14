import { outermostWrapper } from '../../analysis/ancestry.mjs';

const PROMISE_STEPS = new Set(['then', 'catch', 'finally']);
const COMBINATORS = new Set(['all', 'allSettled', 'any', 'race']);
const ESTREE_WRAPPERS = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
]);
const ESTREE_SINKS = new Set(['AwaitExpression', 'ReturnStatement', 'YieldExpression']);
const TERMINAL_METHODS = new Set([
  'exec',
  'then',
  'first',
  'execute',
  'executeTakeFirst',
  'executeTakeFirstOrThrow',
  'getMany',
  'getOne',
  'getOneOrFail',
  'getRawMany',
  'getRawOne',
  'getManyAndCount',
  'getCount',
  'getExists',
  'stream',
]);

export function isPromiseStep(name) {
  return PROMISE_STEPS.has(name);
}

export function isCombinator(name) {
  return COMBINATORS.has(name);
}

export function isTerminalMethod(method) {
  return TERMINAL_METHODS.has(method);
}

function estreeMemberName(node) {
  return node?.type === 'MemberExpression' && !node.computed ? node.property.name : undefined;
}

function isEstreeCollected(node) {
  const { parent } = node;
  const host = parent.type === 'ArrayExpression' ? parent.parent : parent;
  const collector = host.type === 'CallExpression' ? estreeMemberName(host.callee) : undefined;
  const combined = COMBINATORS.has(collector) && host.callee.object.name === 'Promise';
  return host.type === 'CallExpression' && (collector === 'push' || combined);
}

export function isEstreeConsumed(call) {
  const node = outermostWrapper(call, ESTREE_WRAPPERS);
  const { parent } = node;
  if (ESTREE_SINKS.has(parent.type)) {
    return true;
  }
  if (parent.type === 'ArrowFunctionExpression' && parent.body === node) {
    return true;
  }
  const stepped = parent.type === 'MemberExpression' && parent.object === node;
  return (stepped && PROMISE_STEPS.has(estreeMemberName(parent))) || isEstreeCollected(node);
}
