import { annotationIn, argumentOf, isTrue, typeName } from '../spring-names.mts';
import { entriesOf, report, symbolOf } from '../spring-scopes.mts';
import { inWritingTransaction, placeOf, runsInTransaction } from './scope.mts';
import {
  CACHE_EVICT,
  CACHE_MANAGER,
  CACHE_PUT,
  CACHING,
  LOCAL_CACHE_WRITES,
  LOCAL_CACHES,
  MAP_TYPES,
  MEMO_WRITES,
  SPRING_CACHE,
  SPRING_CACHE_WRITES,
  VIEW_WRITES,
} from './transaction-types.mts';
import { databaseWrite } from './writes.mts';
import type {
  Fqns,
  FunctionFact,
  InvocationFact,
  Reported,
  SpringView,
} from '../typed/spring-shapes.mts';

const GET_CACHE = /^(.+?)\.getCache\(.*\)$/su;
const AS_MAP = /^(.+?)\.asMap\(\)$/su;
const THIS = /^this\./u;
const LEADING = /^\w+(?=\.)/u;

function typeAt(
  view: SpringView,
  invocation: { scope: number },
  text: string | undefined,
): string | undefined {
  return text === undefined ? undefined : view.typeOf(invocation.scope, text);
}

function isA(view: SpringView, type: string | undefined, fqns: Fqns): boolean {
  return type !== undefined && view.is(type, fqns);
}

function springCacheWrite(view: SpringView, invocation: InvocationFact): boolean {
  if (!SPRING_CACHE_WRITES.has(invocation.name)) {
    return false;
  }
  const receiver = view.receiverOf(invocation);
  const at = { scope: receiver?.scope ?? invocation.scope };
  const manager = GET_CACHE.exec(receiver?.text ?? '')?.[1];
  return (
    isA(view, typeAt(view, at, receiver?.text), SPRING_CACHE) ||
    isA(view, typeAt(view, at, manager), CACHE_MANAGER)
  );
}

function writeTexts(view: SpringView, invocation: InvocationFact): string[] {
  const fn = placeOf(view, invocation.scope).fn;
  return view.file.invocations
    .filter((other) => placeOf(view, other.scope).fn === fn && databaseWrite(view, other))
    .flatMap((write) => [
      `${String(write.receiver)}.${write.name}(`,
      `${String(write.receiver)}::${write.name}`,
      ...(write.assignedTo === undefined ? [] : [write.assignedTo]),
    ]);
}

function fromWrite(view: SpringView, invocation: InvocationFact): boolean {
  const texts = writeTexts(view, invocation);
  return invocation.arguments.some(({ text }) => {
    const lead = LEADING.exec(text)?.[0];
    return (
      (lead !== undefined && texts.includes(lead)) ||
      texts.some((written) =>
        written.endsWith('(') || written.includes('::') ? text.includes(written) : text === written,
      )
    );
  });
}

function memoField(view: SpringView, invocation: InvocationFact): boolean {
  const receiver = (invocation.receiver ?? '').replace(THIS, '');
  if (
    receiver === '' ||
    receiver.includes('.') ||
    view.declaresLocally(invocation.scope, receiver)
  ) {
    return false;
  }
  const owner = view.chain(invocation.scope).find(({ k }) => k === 'class')?.qualified;
  const property = view.memberPropertiesOf(owner).find(({ name }) => name === receiver);
  const type = property?.type ?? property?.initializer;
  return type !== undefined && MAP_TYPES.has(typeName(type));
}

function localCacheWrite(view: SpringView, invocation: InvocationFact): boolean {
  const viewOf = AS_MAP.exec(invocation.receiver ?? '')?.[1];
  return (
    (LOCAL_CACHE_WRITES.has(invocation.name) &&
      isA(view, typeAt(view, invocation, invocation.receiver), LOCAL_CACHES)) ||
    (VIEW_WRITES.has(invocation.name) &&
      isA(view, typeAt(view, invocation, viewOf), LOCAL_CACHES)) ||
    (invocation.name === 'get' &&
      invocation.arguments.length === 2 &&
      isA(view, typeAt(view, invocation, invocation.receiver), LOCAL_CACHES) &&
      fromWrite(view, invocation)) ||
    (MEMO_WRITES.has(invocation.name) && memoField(view, invocation) && fromWrite(view, invocation))
  );
}

function cacheWrites(
  view: SpringView,
  rule: string,
  write: (view: SpringView, invocation: InvocationFact) => boolean,
): Reported[] {
  return view.file.invocations
    .filter((invocation) => invocation.reference !== true && write(view, invocation))
    .filter((invocation) => inWritingTransaction(view, invocation.scope))
    .map((invocation) => ({
      rule,
      line: invocation.line,
      symbol: symbolOf(view, invocation.scope, invocation.name),
    }));
}

function writesCacheAfterReturn(view: SpringView, fn: FunctionFact): boolean {
  const entries = entriesOf(fn);
  const evict = annotationIn(view.resolve, entries, CACHE_EVICT);
  const caching = annotationIn(view.resolve, entries, CACHING);
  return (
    annotationIn(view.resolve, entries, CACHE_PUT) !== undefined ||
    (evict !== undefined && !isTrue(argumentOf(evict, 'beforeInvocation'))) ||
    (caching?.arguments.some(({ name }) => name === 'put' || name === 'evict') ?? false)
  );
}

function springCacheWrites(view: SpringView): Reported[] {
  const annotated = view.file.functions
    .filter((fn) => writesCacheAfterReturn(view, fn) && runsInTransaction(view, fn))
    .map((fn) => report('SpringCacheWriteInTransaction', fn, `${fn.owner}.${fn.name}`));
  return [...annotated, ...cacheWrites(view, 'SpringCacheWriteInTransaction', springCacheWrite)];
}

function localCacheWrites(view: SpringView): Reported[] {
  return cacheWrites(view, 'SpringLocalCacheWriteInTransaction', localCacheWrite);
}

export const CACHE_WRITE_RULES = [springCacheWrites, localCacheWrites];
