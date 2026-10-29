import { ENTITY_MANAGER } from '../../spring-types.mjs';
import { elementOf, isCollectionType } from '../../view/member-types.mjs';
import { ENTITY_WRITES } from '../data-types.mjs';

export const ITERATING = new Set([
  'forEach',
  'forEachIndexed',
  'onEach',
  'onEachIndexed',
  'forEachOrdered',
  'forEachRemaining',
  'repeat',
]);
const MAPPING = new Set([
  'map',
  'mapIndexed',
  'mapNotNull',
  'mapIndexedNotNull',
  'flatMap',
  'flatMapIndexed',
  'peek',
  'mapToObj',
  'associateWith',
  'associateBy',
  'associate',
  'mapTo',
  'mapNotNullTo',
  'mapIndexedTo',
  'mapIndexedNotNullTo',
  'flatMapTo',
  'associateTo',
  'associateByTo',
  'associateWithTo',
  'mapValues',
  'mapKeys',
]);
const LOOPS = new Set(['loop', 'foreach']);
const CHAIN_LIMIT = 8;
const BOUNDARIES = new Set(['fun', 'class', 'object']);
const COLLECTION_LITERAL =
  /^(?:listOf|setOf|mutableListOf|mutableSetOf|arrayOf|sequenceOf)\(|\.\.|\buntil\b/u;
const COLLECTION_FACTORIES = new Set([
  'listOf',
  'setOf',
  'mutableListOf',
  'mutableSetOf',
  'arrayListOf',
  'hashSetOf',
  'linkedSetOf',
  'arrayOf',
  'sequenceOf',
  'emptyList',
  'emptySet',
]);
const REFERENCE = /^(?:this\.)?(\w*)::(\w+)$/u;

export function entityReceiver(view, invocation) {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  return type !== undefined && (view.isRepository(type) || view.is(type, ENTITY_MANAGER));
}

export function entityWrite(view, invocation) {
  return ENTITY_WRITES.has(invocation.name) && entityReceiver(view, invocation);
}

export function repositoryReceiver(view, invocation) {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  return type !== undefined && view.isRepository(type);
}

export function isCollection(view, scopeId, text) {
  if (text === undefined) {
    return false;
  }
  if (COLLECTION_LITERAL.test(text)) {
    return true;
  }
  const type = view.typeOf(scopeId, text);
  return isCollectionType(type) || COLLECTION_FACTORIES.has(type);
}

export function elementIsCollection(view, scopeId, text) {
  return text !== undefined && isCollectionType(elementOf(view.typeOf(scopeId, text)));
}

function previousCall(view, invocation) {
  const previous = invocation.previous?.name;
  return view.file.invocations
    .filter(
      (candidate) =>
        previous !== undefined &&
        candidate.name === previous &&
        candidate.scope === invocation.scope &&
        (candidate.after ?? []).includes(invocation.name) &&
        (invocation.receiver ?? '').startsWith(candidate.receiver ?? '\0'),
    )
    .reduce(
      (closest, candidate) =>
        closest === undefined || candidate.receiver.length > closest.receiver.length
          ? candidate
          : closest,
      undefined,
    );
}

export function chainOf(view, start) {
  const chain = start === undefined ? [] : [start];
  for (const invocation of chain) {
    const previous = previousCall(view, invocation);
    chain.push(...(previous === undefined || chain.length > CHAIN_LIMIT ? [] : [previous]));
  }
  return chain;
}

function overCollection(view, start) {
  return chainOf(view, start).some((invocation) =>
    isCollection(view, invocation.scope, invocation.receiver),
  );
}

function iteratingCall(view, invocation) {
  return (
    ITERATING.has(invocation.name) ||
    (MAPPING.has(invocation.name) && overCollection(view, invocation))
  );
}

function hostOf(view, scope) {
  return view.file.invocations.find(
    ({ name, scope: parent, receiver }) =>
      name === scope.host && parent === scope.parent && receiver === scope.qualifier,
  );
}

function hosted(scope) {
  return scope.k === 'lambda' || (scope.k === 'fun' && scope.host !== undefined);
}

function iteratingLambda(view, scope) {
  return (
    hosted(scope) &&
    (ITERATING.has(scope.host) ||
      (MAPPING.has(scope.host) &&
        (isCollection(view, scope.parent, scope.qualifier) ||
          overCollection(view, hostOf(view, scope)))))
  );
}

function enclosingFrames(view, scopeId) {
  const chain = view.chain(scopeId);
  const boundary = chain.findIndex((scope) => BOUNDARIES.has(scope.k) && !hosted(scope));
  return boundary < 0 ? chain : chain.slice(0, boundary);
}

function clearedLoop(view, loop) {
  return view.file.invocations.some(
    (invocation) =>
      invocation.name === 'clear' &&
      view.is(view.typeOf(invocation.scope, invocation.receiver), ENTITY_MANAGER) &&
      view.chain(invocation.scope).some(({ id }) => id === loop.id),
  );
}

export function loopFrames(view, scopeId) {
  return enclosingFrames(view, scopeId).filter(
    (scope) => LOOPS.has(scope.k) || iteratingLambda(view, scope),
  );
}

export function inLoop(view, scopeId) {
  return loopFrames(view, scopeId).some((scope) => !clearedLoop(view, scope));
}

export function inClearedLoop(view, scopeId) {
  return loopFrames(view, scopeId).some((scope) => clearedLoop(view, scope));
}

function localReference(view, invocation, name) {
  const local = view
    .chain(invocation.scope)
    .flatMap((scope) =>
      (view.file.locals ?? []).filter((entry) => entry.scope === scope.id && entry.name === name),
    )[0];
  const found =
    local === undefined
      ? undefined
      : view.file.invocations.find(
          (entry) =>
            entry.reference === true && entry.scope === local.scope && entry.line === local.line,
        );
  return found === undefined ? undefined : [found.receiver ?? '', found.name];
}

function referenced(view, invocation, text) {
  const match = REFERENCE.exec(text.trim());
  return match === null ? localReference(view, invocation, text.trim()) : match.slice(1);
}

export function references(view, invocation) {
  return iteratingCall(view, invocation)
    ? invocation.arguments
        .map(({ text }) => referenced(view, invocation, text))
        .filter((found) => found !== undefined)
        .map(([receiver, name]) => ({
          ...invocation,
          receiver: receiver === '' ? undefined : receiver,
          name,
          arguments: [],
          reference: true,
          host: invocation.name,
          iterated: invocation.receiver,
        }))
    : [];
}

export function referencesInLoops(view) {
  return view.file.invocations.flatMap((invocation) => references(view, invocation));
}
