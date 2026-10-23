import { chainOf } from '../../rules/analysis/ancestry.mjs';
import { resolveFunction } from '../../rules/analysis/constant-resolution.mjs';
import { importedCalleeName, moduleBindings } from '../../rules/analysis/subprocess-calls.mjs';

function withNodePrefix(names) {
  return new Set(names.flatMap((name) => [name, `node:${name}`]));
}
const TIMER_MODULES = withNodePrefix(['timers']);
const CALLBACK_MODULES = withNodePrefix([
  'fs',
  'child_process',
  'dns',
  'zlib',
  'crypto',
  'stream',
  'net',
  'http',
  'https',
  'http2',
  'dgram',
]);
const ASSERT_MODULES = new Set([...withNodePrefix(['assert', 'assert/strict']), 'chai']);
const MACROTASKS = new Set([
  'setTimeout',
  'setImmediate',
  'requestAnimationFrame',
  'requestIdleCallback',
]);
const MICROTASKS = new Set(['queueMicrotask', 'nextTick']);
const TIMER_OWNERS = new Set(['globalThis', 'global', 'window', 'self', 'process']);
const LISTENERS = new Set([
  'on',
  'once',
  'addListener',
  'prependListener',
  'prependOnceListener',
  'addEventListener',
  'subscribe',
]);
const OBSERVERS = new Set([
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'PerformanceObserver',
]);
const HANDLER_PROPERTY = /^on[a-z]+$/u;
const ASSERTION_ROOTS = new Set(['expect', 'assert', 'should']);
const NOT_ASSERTIONS = new Set([
  'any',
  'anything',
  'objectContaining',
  'arrayContaining',
  'stringContaining',
  'stringMatching',
  'closeTo',
  'extend',
  'addSnapshotSerializer',
  'addEqualityTesters',
  'getState',
  'setState',
  'assertions',
  'hasAssertions',
]);
const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

export function fileBindings(program) {
  return {
    timers: moduleBindings(program, TIMER_MODULES),
    callbacks: moduleBindings(program, CALLBACK_MODULES),
    asserts: moduleBindings(program, ASSERT_MODULES),
  };
}

export function propertyName(node) {
  if (node?.type !== 'MemberExpression') {
    return undefined;
  }
  if (!node.computed) {
    return node.property.type === 'Identifier' ? node.property.name : undefined;
  }
  return typeof node.property.value === 'string' ? node.property.value : undefined;
}

function calleeLinks(callee) {
  return chainOf(callee, (current) => {
    if (current.type === 'CallExpression') {
      return current.callee;
    }
    return current.type === 'MemberExpression' ? current.object : undefined;
  });
}

export function rootName(node) {
  const root = calleeLinks(node).at(-1);
  if (root?.type === 'ThisExpression') {
    return 'this';
  }
  return root?.type === 'Identifier' ? root.name : undefined;
}

function isAssertRoot(name, bindings) {
  return (
    ASSERTION_ROOTS.has(name) ||
    bindings.asserts.named.has(name) ||
    bindings.asserts.namespaces.has(name)
  );
}

export function isAssertion(node, bindings) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const links = calleeLinks(node.callee);
  const root = links.at(-1);
  if (root?.type !== 'Identifier' || root.name === 'console') {
    return false;
  }
  if (isAssertRoot(root.name, bindings)) {
    const [firstMember] = links.toReversed().slice(1);
    return !NOT_ASSERTIONS.has(propertyName(firstMember));
  }
  return links.some((link) => ['assert', 'should'].includes(propertyName(link)));
}

function unwrappedCallee(callee) {
  if (callee.type === 'SequenceExpression') {
    return callee.expressions.at(-1);
  }
  return callee.type === 'TSAsExpression' || callee.type === 'TSNonNullExpression'
    ? callee.expression
    : callee;
}

function timerName(callee, bindings) {
  if (callee.type === 'Identifier') {
    const name = bindings.timers.named.get(callee.name) ?? callee.name;
    return MACROTASKS.has(name) || MICROTASKS.has(name) ? name : undefined;
  }
  const owner = callee.type === 'MemberExpression' ? callee.object : undefined;
  const isOwner =
    owner?.type === 'Identifier' &&
    (TIMER_OWNERS.has(owner.name) || bindings.timers.namespaces.has(owner.name));
  const name = isOwner ? propertyName(callee) : undefined;
  return MACROTASKS.has(name) || MICROTASKS.has(name) ? name : undefined;
}

function callKind(callee, bindings) {
  const timer = timerName(callee, bindings);
  if (timer !== undefined) {
    return { kind: MICROTASKS.has(timer) ? 'microtask' : 'timer', name: timer };
  }
  const name = propertyName(callee);
  if (LISTENERS.has(name)) {
    return { kind: 'listener', name };
  }
  const api = importedCalleeName(callee, bindings.callbacks);
  return api === undefined || api.endsWith('Sync') ? undefined : { kind: 'callback', name: api };
}

function callbackFunction(context, node) {
  if (FUNCTION_TYPES.has(node?.type)) {
    return node;
  }
  return node?.type === 'Identifier' ? resolveFunction(context, node) : undefined;
}

function hostShape(node, bindings) {
  if (node.type === 'CallExpression') {
    const shape = callKind(unwrappedCallee(node.callee), bindings);
    return shape === undefined ? undefined : { ...shape, candidates: node.arguments };
  }
  if (node.type === 'NewExpression') {
    const name = node.callee.type === 'Identifier' ? node.callee.name : propertyName(node.callee);
    return OBSERVERS.has(name) ? { kind: 'listener', name, candidates: node.arguments } : undefined;
  }
  const name = node.type === 'AssignmentExpression' ? propertyName(node.left) : undefined;
  return name !== undefined && HANDLER_PROPERTY.test(name)
    ? { kind: 'listener', name, candidates: [node.right] }
    : undefined;
}

export function hostOf(context, node, { bindings, asserts }) {
  const shape = hostShape(node, bindings);
  if (shape === undefined) {
    return undefined;
  }
  const callbacks = shape.candidates
    .map((candidate) => callbackFunction(context, candidate))
    .filter((callback) => callback !== undefined && asserts(callback));
  if (callbacks.length === 0) {
    return undefined;
  }
  return { kind: shape.kind, name: shape.name, node, callbacks };
}
