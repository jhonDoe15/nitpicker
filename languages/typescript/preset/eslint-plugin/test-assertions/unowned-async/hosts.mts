import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveFunction,
  type SourceContext,
} from '../../rules/analysis/constant-resolution.mts';
import { importedCalleeName, moduleBindings } from '../../rules/analysis/subprocess-calls.mts';
import { nodesIn, propertyName, type FileBindings, type FunctionNode } from './nodes.mts';

type HostKind = 'microtask' | 'timer' | 'listener' | 'callback';
type HostShape = {
  readonly kind: HostKind;
  readonly name: string;
  readonly candidates: readonly TSESTree.Node[];
};
export type Host = {
  readonly kind: HostKind;
  readonly name: string;
  readonly node: TSESTree.CallExpression | TSESTree.NewExpression | TSESTree.AssignmentExpression;
  readonly callbacks: FunctionNode[];
};

function withNodePrefix(names: readonly string[]): Set<string> {
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
const EXPECT_MODULES = new Set(['vitest', '@jest/globals', '@playwright/test']);
const ASSERTION_IMPORT_NAME = /^(?:assert|expect)(?![a-z])/u;
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

function importedAssertionNames(program: TSESTree.Program): string[] {
  return program.body
    .flatMap((statement) =>
      statement.type === AST_NODE_TYPES.ImportDeclaration && statement.importKind !== 'type'
        ? statement.specifiers
        : [],
    )
    .filter((specifier) => specifier.type !== AST_NODE_TYPES.ImportNamespaceSpecifier)
    .filter(
      (specifier) =>
        !(specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind === 'type'),
    )
    .map((specifier) => specifier.local.name)
    .filter((name) => ASSERTION_IMPORT_NAME.test(name));
}

export function fileBindings(
  program: TSESTree.Program,
  assertionNames: readonly string[] = [],
): FileBindings {
  return {
    assertionNames: new Set([...assertionNames, ...importedAssertionNames(program)]),
    expects: moduleBindings(program, EXPECT_MODULES),
    timers: moduleBindings(program, TIMER_MODULES),
    callbacks: moduleBindings(program, CALLBACK_MODULES),
    asserts: moduleBindings(program, ASSERT_MODULES),
    nodeTest: moduleBindings(program, NODE_TEST_MODULES),
    rx: moduleBindings(program, RX_MODULES),
  };
}

function unwrappedCallee(callee: TSESTree.Node): TSESTree.Node {
  if (callee.type === AST_NODE_TYPES.SequenceExpression) {
    return callee.expressions.at(-1) ?? callee;
  }
  return callee.type === AST_NODE_TYPES.TSAsExpression ||
    callee.type === AST_NODE_TYPES.TSNonNullExpression
    ? callee.expression
    : callee;
}

function isGlobalName(context: SourceContext, identifier: TSESTree.Identifier): boolean {
  const variable = findVariable(context, identifier, identifier.name);
  return variable === undefined || variable.defs.length === 0;
}

function bareTimer(
  context: SourceContext,
  callee: TSESTree.Identifier,
  bindings: FileBindings,
): string | undefined {
  const imported = bindings.timers.named.get(callee.name);
  if (imported !== undefined) {
    return imported;
  }
  return callee.name !== 'nextTick' && isGlobalName(context, callee) ? callee.name : undefined;
}

function memberTimer(
  context: SourceContext,
  callee: TSESTree.Node,
  bindings: FileBindings,
): string | undefined {
  const owner = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  if (owner?.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const isOwner =
    bindings.timers.namespaces.has(owner.name) ||
    (TIMER_OWNERS.has(owner.name) && isGlobalName(context, owner));
  return isOwner ? propertyName(callee) : undefined;
}

function timerName(
  context: SourceContext,
  callee: TSESTree.Node,
  bindings: FileBindings,
): string | undefined {
  const name =
    callee.type === AST_NODE_TYPES.Identifier
      ? bareTimer(context, callee, bindings)
      : memberTimer(context, callee, bindings);
  return name !== undefined && (MACROTASKS.has(name) || MICROTASKS.has(name)) ? name : undefined;
}

function isAsyncObservable(
  context: SourceContext,
  receiver: TSESTree.Node,
  rx: FileBindings['rx'],
): boolean {
  return nodesIn(context, receiver, (node) => !isFunctionNode(node)).some(
    (node) =>
      node.type === AST_NODE_TYPES.CallExpression &&
      ASYNC_RX.has(importedCalleeName(node.callee, rx) ?? ''),
  );
}

function listenerName(
  context: SourceContext,
  callee: TSESTree.Node,
  bindings: FileBindings,
): string | undefined {
  const name = propertyName(callee);
  if (
    name === undefined ||
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    !LISTENERS.has(name)
  ) {
    return undefined;
  }
  const isSource = name !== 'subscribe' || isAsyncObservable(context, callee.object, bindings.rx);
  return isSource ? name : undefined;
}

function callKind(
  context: SourceContext,
  callee: TSESTree.Node,
  bindings: FileBindings,
): { kind: HostKind; name: string } | undefined {
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

export function resolvedFunction(
  context: SourceContext,
  node: TSESTree.Node | undefined,
): FunctionNode | undefined {
  const resolved = resolveFunction(context, node);
  return isFunctionNode(resolved) ? resolved : undefined;
}

function callbackFunction(context: SourceContext, node: TSESTree.Node): FunctionNode | undefined {
  return isFunctionNode(node) ? node : resolvedFunction(context, node);
}

function isHostNode(node: TSESTree.Node): node is Host['node'] {
  return (
    node.type === AST_NODE_TYPES.CallExpression ||
    node.type === AST_NODE_TYPES.NewExpression ||
    node.type === AST_NODE_TYPES.AssignmentExpression
  );
}

export function hostShape(
  context: SourceContext,
  node: TSESTree.Node,
  bindings: FileBindings,
): HostShape | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const shape = callKind(context, unwrappedCallee(node.callee), bindings);
    return shape === undefined ? undefined : { ...shape, candidates: node.arguments };
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    const name =
      node.callee.type === AST_NODE_TYPES.Identifier ? node.callee.name : propertyName(node.callee);
    return name !== undefined && OBSERVERS.has(name)
      ? { kind: 'listener', name, candidates: node.arguments }
      : undefined;
  }
  if (node.type !== AST_NODE_TYPES.AssignmentExpression) {
    return undefined;
  }
  const name = propertyName(node.left);
  return name !== undefined && HANDLER_PROPERTY.test(name)
    ? { kind: 'listener', name, candidates: [node.right] }
    : undefined;
}

export function hostOf(
  context: SourceContext,
  node: TSESTree.Node,
  { bindings, asserts }: { bindings: FileBindings; asserts: (callback: FunctionNode) => boolean },
): Host | undefined {
  const shape = hostShape(context, node, bindings);
  if (shape === undefined || !isHostNode(node)) {
    return undefined;
  }
  const callbacks = shape.candidates.flatMap((candidate) => {
    const callback = callbackFunction(context, candidate);
    return callback !== undefined && asserts(callback) ? [callback] : [];
  });
  if (callbacks.length === 0) {
    return undefined;
  }
  return { kind: shape.kind, name: shape.name, node, callbacks };
}
