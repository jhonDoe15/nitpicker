import { annotationIn } from './spring-names.mts';
import {
  BEAN,
  COMPLETABLE_FUTURE,
  POST_CONSTRUCT,
  STEREOTYPES,
  SYNCHRONIZED,
} from './spring-types.mts';
import type {
  Annotation,
  AnnotationHolder,
  Declaration,
  Fqns,
  FunctionFact,
  InvocationFact,
  Reported,
  SpringView,
} from './typed/spring-shapes.mts';

const INIT_NAMES = new Set(['afterPropertiesSet']);
const STARTUP_NAMES = new Set([...INIT_NAMES, 'afterSingletonsInstantiated']);
const LOCKED_HOSTS = new Set(['synchronized', 'withLock']);
const LOCK_CALLS = new Set(['lock', 'lockInterruptibly', 'tryLock', 'withLock']);
const HELPER_LEVELS = 2;
const THIS = /^this$/u;
const TYPE_NAME = /^[A-Z]/u;
const FUTURE_FACTORIES = new Set(['completedFuture', 'supplyAsync', 'runAsync', 'failedFuture']);
const FACTORY_TYPES: Record<string, string> = {
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
  arrayListOf: 'ArrayList',
  hashSetOf: 'HashSet',
  linkedSetOf: 'LinkedHashSet',
  sortedSetOf: 'SortedSet',
  sortedMapOf: 'SortedMap',
  emptySet: 'Set',
  arrayOf: 'Array',
  sequenceOf: 'Sequence',
  emptySequence: 'Sequence',
};

export function factoryType(name: string | undefined): string | undefined {
  return name !== undefined && Object.hasOwn(FACTORY_TYPES, name) ? FACTORY_TYPES[name] : undefined;
}

export function entriesOf(declaration: AnnotationHolder): Annotation[] {
  return declaration.annotationEntries ?? declaration.annotations ?? [];
}

export function report(rule: string, declaration: Declaration, symbol: string): Reported {
  return { rule, line: declaration.line, symbol };
}

export function has(view: SpringView, declaration: AnnotationHolder, fqns: Fqns): boolean {
  return annotationIn(view.resolve, entriesOf(declaration), fqns) !== undefined;
}

export function managed(view: SpringView, declared: Declaration | undefined): boolean {
  return declared !== undefined && has(view, declared, STEREOTYPES);
}

export function ownerOf(view: SpringView, invocation: InvocationFact): string {
  return view.chain(invocation.scope).find(({ k }) => k === 'class')?.qualified ?? '';
}

export function symbolOf(
  view: SpringView,
  scopeId: number | undefined,
  name: string | undefined,
): string {
  const fn = view.chain(scopeId).find(({ k, name }) => k === 'fun' && name !== undefined);
  const owner = view.chain(scopeId).find(({ k }) => k === 'class')?.qualified;
  return [owner, fn?.name, name].filter((part) => part !== undefined && part !== '').join('.');
}

export function isSelfCall(view: SpringView, invocation: InvocationFact): boolean {
  return (
    invocation.assign !== true &&
    invocation.reference !== true &&
    invocation.index !== true &&
    (invocation.receiver === undefined || THIS.test(invocation.receiver)) &&
    view.implicitReceiver(invocation.scope)?.text === undefined
  );
}

export function acceptsArguments(fn: FunctionFact, count: number): boolean {
  const required = fn.parameters.filter((parameter) => !(parameter.default || parameter.vararg));
  return (
    count >= required.length &&
    (fn.parameters.some(({ vararg }) => vararg) || count <= fn.parameters.length)
  );
}

export function beanMethodNames(view: SpringView, option: string): Set<string> {
  return new Set(
    view.file.functions
      .map((fn) => annotationIn(view.resolve, entriesOf(fn), BEAN))
      .flatMap((entry) => entry?.arguments ?? [])
      .filter(({ name }) => name === option)
      .map(({ text }) => text.replaceAll('"', '')),
  );
}

export function invocationsNamed(view: SpringView, name: string): InvocationFact[] {
  const named = view.memo(
    'invocationsNamed',
    () => Map.groupBy(view.file.invocations, (invocation) => invocation.name),
    (value): value is Map<string | undefined, InvocationFact[]> => value instanceof Map,
  );
  return named.get(name) ?? [];
}

function callersOf(view: SpringView, fn: FunctionFact) {
  return invocationsNamed(view, fn.name).filter(
    (invocation) => isSelfCall(view, invocation) && ownerOf(view, invocation) === fn.owner,
  );
}

function inStartOf(
  view: SpringView,
  startFunctions: Set<FunctionFact>,
  scopeId: number | undefined,
): boolean {
  const fnScope = view.chain(scopeId).find(({ k }) => k === 'fun');
  if (fnScope === undefined || fnScope.name === '<init>') {
    return true;
  }
  const fn = view.functionAt(scopeId);
  return fn !== undefined && startFunctions.has(fn);
}

function helpersOf(view: SpringView, startFunctions: Set<FunctionFact>): FunctionFact[] {
  return view.file.functions.filter((fn) => {
    const callers = callersOf(view, fn);
    return (
      fn.visibility === 'private' &&
      callers.length > 0 &&
      callers.every((call) => inStartOf(view, startFunctions, call.scope))
    );
  });
}

export function setupScopes(
  view: SpringView,
  isStart: (fn: FunctionFact) => boolean,
): (scopeId: number | undefined) => boolean {
  const startFunctions = Array.from({ length: HELPER_LEVELS }).reduce<Set<FunctionFact>>(
    (known) => new Set([...known, ...helpersOf(view, known)]),
    new Set(view.file.functions.filter((fn) => isStart(fn))),
  );
  return (scopeId) => inStartOf(view, startFunctions, scopeId);
}

export function startupScopes(
  view: SpringView,
  { singletons }: { singletons: boolean } = { singletons: true },
): (scopeId: number | undefined) => boolean {
  const initNames = beanMethodNames(view, 'initMethod');
  const callbacks = singletons ? STARTUP_NAMES : INIT_NAMES;
  return setupScopes(
    view,
    (fn) =>
      annotationIn(view.resolve, entriesOf(fn), POST_CONSTRUCT) !== undefined ||
      (fn.parameters.length === 0 && (callbacks.has(fn.name) || initNames.has(fn.name))),
  );
}

export function lockedScope(view: SpringView, scopeId: number | undefined): boolean {
  const chain = view.chain(scopeId);
  if (chain.some(({ k, host }) => k === 'lambda' && host !== undefined && LOCKED_HOSTS.has(host))) {
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

export function returnTypeOf(view: SpringView, fn: FunctionFact): string | undefined {
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
  const type = factoryType(call.name) ?? (TYPE_NAME.test(call.name) ? call.name : undefined);
  return type === undefined || call.typeArgumentList === undefined
    ? undefined
    : `${type}${call.typeArgumentList}`;
}
