import { typeName } from '../spring-names.mjs';
import { ENTITY_MANAGER } from '../spring-types.mjs';
import { COLLECTION_TYPES } from './data-types.mjs';

const ITERATING = new Set([
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
  'flatMap',
  'peek',
  'mapToObj',
  'associateWith',
  'associateBy',
  'associate',
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
  return (
    type !== undefined &&
    (COLLECTION_TYPES.has(typeName(type).split('.').at(-1)) || COLLECTION_FACTORIES.has(type))
  );
}

function previousCall(view, invocation) {
  const previous = invocation.previous?.name;
  return view.file.invocations.find(
    (candidate) =>
      previous !== undefined &&
      candidate.name === previous &&
      candidate.scope === invocation.scope &&
      (candidate.after ?? []).includes(invocation.name) &&
      (invocation.receiver ?? '').startsWith(candidate.receiver ?? '\0'),
  );
}

function overCollection(view, start) {
  const chain = start === undefined ? [] : [start];
  for (const invocation of chain) {
    if (isCollection(view, invocation.scope, invocation.receiver)) {
      return true;
    }
    const previous = previousCall(view, invocation);
    chain.push(...(previous === undefined || chain.length > CHAIN_LIMIT ? [] : [previous]));
  }
  return false;
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

function iteratingLambda(view, scope) {
  return (
    scope.k === 'lambda' &&
    (ITERATING.has(scope.host) ||
      (MAPPING.has(scope.host) &&
        (isCollection(view, scope.parent, scope.qualifier) ||
          overCollection(view, hostOf(view, scope)))))
  );
}

function enclosingFrames(view, scopeId) {
  const chain = view.chain(scopeId);
  const boundary = chain.findIndex(({ k }) => BOUNDARIES.has(k));
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

export function inLoop(view, scopeId) {
  return enclosingFrames(view, scopeId).some(
    (scope) => (LOOPS.has(scope.k) && !clearedLoop(view, scope)) || iteratingLambda(view, scope),
  );
}

export function inClearedLoop(view, scopeId) {
  return enclosingFrames(view, scopeId).some(
    (scope) => LOOPS.has(scope.k) && clearedLoop(view, scope),
  );
}

export function references(view, invocation) {
  return iteratingCall(view, invocation)
    ? invocation.arguments
        .map(({ text }) => REFERENCE.exec(text.trim()))
        .filter((match) => match !== null)
        .map(([, receiver, name]) => ({
          ...invocation,
          receiver: receiver === '' ? undefined : receiver,
          name,
          arguments: [],
          reference: true,
        }))
    : [];
}
