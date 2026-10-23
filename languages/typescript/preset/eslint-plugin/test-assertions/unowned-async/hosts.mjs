import {
  findVariable,
  isFunctionNode,
  resolveFunction,
} from '../../rules/analysis/constant-resolution.mjs';
import { importedCalleeName, moduleBindings } from '../../rules/analysis/subprocess-calls.mjs';
import { nodesIn, propertyName } from './nodes.mjs';

function withNodePrefix(names) {
  return new Set(names.flatMap((name) => [name, `node:${name}`]));
}
const TIMER_MODULES = withNodePrefix(['timers', 'process']);
const CALLBACK_MODULES = withNodePrefix([
  'fs',
  'child_process',
  'dns',
  'zlib',
  'crypto',
  'stream',
  'net',
  'tls',
  'http',
  'https',
  'http2',
  'dgram',
]);
const ASSERT_MODULES = new Set([...withNodePrefix(['assert', 'assert/strict']), 'chai']);
const NODE_TEST_MODULES = new Set(['node:test']);
const RX_MODULES = new Set(['rxjs', 'rxjs/operators', 'rxjs/webSocket', 'rxjs/fetch']);
const ASYNC_RX = new Set([
  'interval',
  'timer',
  'fromEvent',
  'fromEventPattern',
  'webSocket',
  'animationFrames',
  'fromFetch',
  'delay',
  'delayWhen',
  'debounceTime',
  'throttleTime',
  'auditTime',
  'sampleTime',
  'timeout',
  'observeOn',
  'subscribeOn',
  'bufferTime',
]);
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
const LONG_LIVED_APIS = new Set([
  'createServer',
  'createSecureServer',
  'createSocket',
  'connect',
  'createConnection',
  'watch',
  'watchFile',
]);
const OBSERVERS = new Set([
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'PerformanceObserver',
]);
const HANDLER_PROPERTY = /^on[a-z]+$/u;

export function fileBindings(program) {
  return {
    timers: moduleBindings(program, TIMER_MODULES),
    callbacks: moduleBindings(program, CALLBACK_MODULES),
    asserts: moduleBindings(program, ASSERT_MODULES),
    nodeTest: moduleBindings(program, NODE_TEST_MODULES),
    rx: moduleBindings(program, RX_MODULES),
  };
}

function unwrappedCallee(callee) {
  if (callee.type === 'SequenceExpression') {
    return callee.expressions.at(-1);
  }
  return callee.type === 'TSAsExpression' || callee.type === 'TSNonNullExpression'
    ? callee.expression
    : callee;
}

function isGlobalName(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  return variable === undefined || variable.defs.length === 0;
}

function bareTimer(context, callee, bindings) {
  const imported = bindings.timers.named.get(callee.name);
  if (imported !== undefined) {
    return imported;
  }
  return callee.name !== 'nextTick' && isGlobalName(context, callee) ? callee.name : undefined;
}

function memberTimer(context, callee, bindings) {
  const owner = callee.type === 'MemberExpression' ? callee.object : undefined;
  if (owner?.type !== 'Identifier') {
    return undefined;
  }
  const isOwner =
    bindings.timers.namespaces.has(owner.name) ||
    (TIMER_OWNERS.has(owner.name) && isGlobalName(context, owner));
  return isOwner ? propertyName(callee) : undefined;
}

function timerName(context, callee, bindings) {
  const name =
    callee.type === 'Identifier'
      ? bareTimer(context, callee, bindings)
      : memberTimer(context, callee, bindings);
  return MACROTASKS.has(name) || MICROTASKS.has(name) ? name : undefined;
}

function isAsyncObservable(context, receiver, rx) {
  return nodesIn(context, receiver, (node) => !isFunctionNode(node)).some(
    (node) => node.type === 'CallExpression' && ASYNC_RX.has(importedCalleeName(node.callee, rx)),
  );
}

function listenerName(context, callee, bindings) {
  const name = propertyName(callee);
  if (!LISTENERS.has(name)) {
    return undefined;
  }
  const isSource = name !== 'subscribe' || isAsyncObservable(context, callee.object, bindings.rx);
  return isSource ? name : undefined;
}

function callKind(context, callee, bindings) {
  const timer = timerName(context, callee, bindings);
  if (timer !== undefined) {
    return { kind: MICROTASKS.has(timer) ? 'microtask' : 'timer', name: timer };
  }
  const listener = listenerName(context, callee, bindings);
  if (listener !== undefined) {
    return { kind: 'listener', name: listener };
  }
  const api = importedCalleeName(callee, bindings.callbacks);
  if (api === undefined || api.endsWith('Sync')) {
    return undefined;
  }
  return { kind: LONG_LIVED_APIS.has(api) ? 'listener' : 'callback', name: api };
}

export function resolvedFunction(context, node) {
  const resolved = resolveFunction(context, node);
  return isFunctionNode(resolved) ? resolved : undefined;
}

function callbackFunction(context, node) {
  return isFunctionNode(node) ? node : resolvedFunction(context, node);
}

export function hostShape(context, node, bindings) {
  if (node.type === 'CallExpression') {
    const shape = callKind(context, unwrappedCallee(node.callee), bindings);
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
  const shape = hostShape(context, node, bindings);
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
