import { annotationIn, argumentOf, isTrue, typeName } from '../spring-names.mjs';
import { entriesOf, report, symbolOf } from '../spring-scopes.mjs';
import { inWritingTransaction, placeOf, runsInTransaction } from './scope.mjs';
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
} from './transaction-types.mjs';
import { databaseWrite } from './writes.mjs';

const GET_CACHE = /^(.+?)\.getCache\(.*\)$/su;
const AS_MAP = /^(.+?)\.asMap\(\)$/su;
const THIS = /^this\./u;
const LEADING = /^\w+(?=\.)/u;

function typeAt(view, invocation, text) {
  return text === undefined ? undefined : view.typeOf(invocation.scope, text);
}

function isA(view, type, fqns) {
  return type !== undefined && view.is(type, fqns);
}

function springCacheWrite(view, invocation) {
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

function writeTexts(view, invocation) {
  const fn = placeOf(view, invocation.scope).fn;
  return view.file.invocations
    .filter((other) => placeOf(view, other.scope).fn === fn && databaseWrite(view, other))
    .flatMap((write) => [
      `${write.receiver}.${write.name}(`,
      `${write.receiver}::${write.name}`,
      ...(write.assignedTo === undefined ? [] : [write.assignedTo]),
    ]);
}

function fromWrite(view, invocation) {
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

function memoField(view, invocation) {
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

function localCacheWrite(view, invocation) {
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

function cacheWrites(view, rule, write) {
  return view.file.invocations
    .filter((invocation) => invocation.reference !== true && write(view, invocation))
    .filter((invocation) => inWritingTransaction(view, invocation.scope))
    .map((invocation) => ({
      rule,
      line: invocation.line,
      symbol: symbolOf(view, invocation.scope, invocation.name),
    }));
}

function writesCacheAfterReturn(view, fn) {
  const entries = entriesOf(fn);
  const evict = annotationIn(view.resolve, entries, CACHE_EVICT);
  const caching = annotationIn(view.resolve, entries, CACHING);
  return (
    annotationIn(view.resolve, entries, CACHE_PUT) !== undefined ||
    (evict !== undefined && !isTrue(argumentOf(evict, 'beforeInvocation'))) ||
    (caching?.arguments.some(({ name }) => name === 'put' || name === 'evict') ?? false)
  );
}

function springCacheWrites(view) {
  const annotated = view.file.functions
    .filter((fn) => writesCacheAfterReturn(view, fn) && runsInTransaction(view, fn))
    .map((fn) => report('SpringCacheWriteInTransaction', fn, `${fn.owner}.${fn.name}`));
  return [...annotated, ...cacheWrites(view, 'SpringCacheWriteInTransaction', springCacheWrite)];
}

function localCacheWrites(view) {
  return cacheWrites(view, 'SpringLocalCacheWriteInTransaction', localCacheWrite);
}

export const CACHE_WRITE_RULES = [springCacheWrites, localCacheWrites];
