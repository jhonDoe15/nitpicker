import { annotationIn } from './spring-names.mjs';
import { BEAN, POST_CONSTRUCT, SYNCHRONIZED } from './spring-types.mjs';

const STARTUP_NAMES = new Set(['afterPropertiesSet', 'afterSingletonsInstantiated']);
const LOCKED_HOSTS = new Set(['synchronized', 'withLock']);
const LOCK_CALLS = new Set(['lock', 'lockInterruptibly', 'tryLock', 'withLock']);
const HELPER_LEVELS = 2;
const THIS = /^this$/u;

export function entriesOf(declaration) {
  return declaration.annotationEntries ?? [];
}

export function report(rule, declaration, symbol) {
  return { rule, line: declaration.line, symbol };
}

export function has(view, declaration, fqns) {
  return annotationIn(view.resolve, entriesOf(declaration), fqns) !== undefined;
}

export function ownerOf(view, invocation) {
  return view.chain(invocation.scope).find(({ k }) => k === 'class')?.qualified ?? '';
}

export function symbolOf(view, scopeId, name) {
  const fn = view.chain(scopeId).find(({ k }) => k === 'fun');
  const owner = view.chain(scopeId).find(({ k }) => k === 'class')?.qualified;
  return [owner, fn?.name, name].filter(Boolean).join('.');
}

export function isSelfCall(invocation) {
  return (
    invocation.assign !== true &&
    invocation.reference !== true &&
    (invocation.receiver === undefined || THIS.test(invocation.receiver))
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

function callersOf(view, fn) {
  return view.file.invocations.filter(
    (invocation) =>
      invocation.name === fn.name &&
      isSelfCall(invocation) &&
      ownerOf(view, invocation) === fn.owner,
  );
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

export function startupScopes(view) {
  const initNames = initMethods(view);
  return setupScopes(
    view,
    (fn) =>
      annotationIn(view.resolve, entriesOf(fn), POST_CONSTRUCT) !== undefined ||
      (fn.parameters.length === 0 && (STARTUP_NAMES.has(fn.name) || initNames.has(fn.name))),
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
