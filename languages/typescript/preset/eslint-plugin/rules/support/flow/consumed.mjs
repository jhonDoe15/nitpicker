import ts from 'typescript';

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

export function isTerminalMethod(method) {
  return TERMINAL_METHODS.has(method);
}

function estreeOuter(call) {
  const chain = [call];
  for (const node of chain) {
    if (ESTREE_WRAPPERS.has(node.parent?.type)) {
      chain.push(node.parent);
    }
  }
  return chain.at(-1);
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
  const node = estreeOuter(call);
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

function tsOuter(call) {
  const chain = [call];
  for (const node of chain) {
    const { parent } = node;
    if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent)) {
      chain.push(parent);
    }
  }
  return chain.at(-1);
}

function isTsCollected(node) {
  const { parent } = node;
  const host = ts.isArrayLiteralExpression(parent) ? parent.parent : parent;
  if (!ts.isCallExpression(host) || !ts.isPropertyAccessExpression(host.expression)) {
    return false;
  }
  const { name, expression } = host.expression;
  const combined =
    COMBINATORS.has(name.text) && ts.isIdentifier(expression) && expression.text === 'Promise';
  return name.text === 'push' || combined;
}

export function isTsConsumed(call) {
  const node = tsOuter(call);
  const { parent } = node;
  const sink =
    ts.isAwaitExpression(parent) ||
    ts.isReturnStatement(parent) ||
    ts.isYieldExpression(parent) ||
    (ts.isArrowFunction(parent) && parent.body === node);
  if (sink) {
    return true;
  }
  const stepped =
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    PROMISE_STEPS.has(parent.name.text);
  return stepped || isTsCollected(node);
}
