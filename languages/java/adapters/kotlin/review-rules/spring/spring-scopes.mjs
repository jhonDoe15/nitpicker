import { annotationIn } from './spring-names.mjs';
import {
  BEAN,
  COMPLETABLE_FUTURE,
  POST_CONSTRUCT,
  STEREOTYPES,
  SYNCHRONIZED,
} from './spring-types.mjs';

const INIT_NAMES = new Set(['afterPropertiesSet']);
const STARTUP_NAMES = new Set([...INIT_NAMES, 'afterSingletonsInstantiated']);
const LOCKED_HOSTS = new Set(['synchronized', 'withLock']);
const LOCK_CALLS = new Set(['lock', 'lockInterruptibly', 'tryLock', 'withLock']);
const HELPER_LEVELS = 2;
const THIS = /^this$/u;
const TYPE_NAME = /^[A-Z]/u;
const FUTURE_FACTORIES = new Set(['completedFuture', 'supplyAsync', 'runAsync', 'failedFuture']);
const FACTORY_TYPES = {
  mapOf: 'Map',
  mutableMapOf: 'MutableMap',
  hashMapOf: 'HashMap',
  linkedMapOf: 'LinkedHashMap',
  emptyMap: 'Map',
  listOf: 'List',
  mutableListOf: 'MutableList',
  emptyList: 'List',
  setOf: 'Set',
  mutableSetOf: 'MutableSet',
};

const NAMED_INVOCATIONS = new WeakMap();

export function entriesOf(declaration) {
  return declaration.annotationEntries ?? declaration.annotations ?? [];
}

export function report(rule, declaration, symbol) {
  return { rule, line: declaration.line, symbol };
}

export function has(view, declaration, fqns) {
  return annotationIn(view.resolve, entriesOf(declaration), fqns) !== undefined;
}

export function managed(view, declared) {
  return declared !== undefined && has(view, declared, STEREOTYPES);
}

export function ownerOf(view, invocation) {
  return view.chain(invocation.scope).find(({ k }) => k === 'class')?.qualified ?? '';
}

export function symbolOf(view, scopeId, name) {
  const fn = view.chain(scopeId).find(({ k }) => k === 'fun');
  const owner = view.chain(scopeId).find(({ k }) => k === 'class')?.qualified;
  return [owner, fn?.name, name].filter(Boolean).join('.');
}

export function isSelfCall(view, invocation) {
  return (
    invocation.assign !== true &&
    invocation.reference !== true &&
    invocation.index !== true &&
    (invocation.receiver === undefined || THIS.test(invocation.receiver)) &&
    view.implicitReceiver(invocation.scope)?.text === undefined
  );
}

export function acceptsArguments(fn, count) {
  const required = fn.parameters.filter((parameter) => !parameter.default && !parameter.vararg);
  return (
    count >= required.length &&
    (fn.parameters.some(({ vararg }) => vararg) || count <= fn.parameters.length)
  );
}

function initMethods(view) {
  return new Set(
    view.file.functions
      .map((fn) => annotationIn(view.resolve, entriesOf(fn), BEAN))
      .flatMap((entry) => entry?.arguments ?? [])
      .filter(({ name }) => name === 'initMethod')
      .map(({ text }) => text.replaceAll('"', '')),
  );
}

export function invocationsNamed(view, name) {
  if (!NAMED_INVOCATIONS.has(view)) {
    const named = Map.groupBy(view.file.invocations, (invocation) => invocation.name);
    NAMED_INVOCATIONS.set(view, named);
  }
  return NAMED_INVOCATIONS.get(view).get(name) ?? [];
}

export function callersOf(view, fn, { visible } = {}) {
  const matches =
    visible ??
    ((invocation) => isSelfCall(view, invocation) && ownerOf(view, invocation) === fn.owner);
  return invocationsNamed(view, fn.name).filter((invocation) => matches(invocation));
}

function inStartOf(view, startFunctions, scopeId) {
  const fnScope = view.chain(scopeId).find(({ k }) => k === 'fun');
  if (fnScope === undefined || fnScope.name === '<init>') {
    return true;
  }
  const fn = view.functionAt(scopeId);
  return fn !== undefined && startFunctions.has(fn);
}

function helpersOf(view, startFunctions) {
  return view.file.functions.filter((fn) => {
    const callers = callersOf(view, fn);
    return (
      fn.visibility === 'private' &&
      callers.length > 0 &&
      callers.every((call) => inStartOf(view, startFunctions, call.scope))
    );
  });
}

export function setupScopes(view, isStart) {
  const startFunctions = Array.from({ length: HELPER_LEVELS }).reduce(
    (known) => new Set([...known, ...helpersOf(view, known)]),
    new Set(view.file.functions.filter((fn) => isStart(fn))),
  );
  return (scopeId) => inStartOf(view, startFunctions, scopeId);
}

export function startupScopes(view, { singletons = true } = {}) {
  const initNames = initMethods(view);
  const callbacks = singletons ? STARTUP_NAMES : INIT_NAMES;
  return setupScopes(
    view,
    (fn) =>
      annotationIn(view.resolve, entriesOf(fn), POST_CONSTRUCT) !== undefined ||
      (fn.parameters.length === 0 && (callbacks.has(fn.name) || initNames.has(fn.name))),
  );
}

export function lockedScope(view, scopeId) {
  const chain = view.chain(scopeId);
  if (chain.some(({ k, host }) => k === 'lambda' && LOCKED_HOSTS.has(host))) {
    return true;
  }
  const fn = view.functionAt(scopeId);
  if (fn === undefined) {
    return false;
  }
  return (
    annotationIn(view.resolve, entriesOf(fn), SYNCHRONIZED) !== undefined ||
    view.file.invocations.some(
      (invocation) => LOCK_CALLS.has(invocation.name) && view.functionAt(invocation.scope) === fn,
    )
  );
}

export function returnTypeOf(view, fn) {
  if (fn.returnType !== undefined || fn.expressionBody !== true) {
    return fn.returnType;
  }
  if (fn.returns !== undefined) {
    return fn.parameters.find(({ name }) => name === fn.returns)?.type;
  }
  const call = fn.forward;
  if (call === undefined) {
    return undefined;
  }
  if (call.qualifier !== undefined) {
    return FUTURE_FACTORIES.has(call.name) && view.is(call.qualifier, COMPLETABLE_FUTURE)
      ? [...COMPLETABLE_FUTURE][0]
      : undefined;
  }
  const type = FACTORY_TYPES[call.name] ?? (TYPE_NAME.test(call.name) ? call.name : undefined);
  return type === undefined || call.typeArgumentList === undefined
    ? undefined
    : `${type}${call.typeArgumentList}`;
}
