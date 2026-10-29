import { QUERY_TYPES } from '../data/data-types.mjs';
import { typeArguments, typeName } from '../spring-names.mjs';
import { acceptsArguments, factoryType, returnTypeOf } from '../spring-scopes.mjs';
import { ENTITY_MANAGER } from '../spring-types.mjs';
import { elementOf, isCollectionType, isMapType, simpleName } from './member-types.mjs';
import { ownersOf } from './project-types.mjs';

const QUERY = 'jakarta.persistence.Query';
const QUERY_CREATORS = new Set(['createQuery', 'createNamedQuery', 'createNativeQuery']);
const QUERY_SETTERS = new Set([
  'setParameter',
  'setLockMode',
  'setFlushMode',
  'setFirstResult',
  'setMaxResults',
  'setHint',
]);
const SAME_RECEIVER = new Set(['apply', 'also', 'takeIf', 'takeUnless']);
const SAME_COLLECTION = new Set([
  'filter',
  'filterNot',
  'filterNotNull',
  'filterIndexed',
  'filterIsInstance',
  'distinct',
  'distinctBy',
  'sorted',
  'sortedBy',
  'sortedDescending',
  'sortedByDescending',
  'sortedWith',
  'reversed',
  'shuffled',
  'take',
  'takeLast',
  'takeWhile',
  'takeLastWhile',
  'drop',
  'dropLast',
  'dropWhile',
  'dropLastWhile',
  'plus',
  'minus',
  'onEach',
  'onEachIndexed',
  'orEmpty',
  'ifEmpty',
  'subList',
]);
const ELEMENTS = new Set([
  'first',
  'last',
  'single',
  'firstOrNull',
  'lastOrNull',
  'singleOrNull',
  'random',
  'elementAt',
  'getOrNull',
  'find',
  'findLast',
  'maxBy',
  'minBy',
  'maxByOrNull',
  'minByOrNull',
  'next',
]);
const MAP_VALUES = new Set(['get', 'getValue', 'getOrPut', 'getOrDefault', 'getOrElse']);
const MAPPED = new Set([
  'map',
  'mapNotNull',
  'mapIndexed',
  'mapIndexedNotNull',
  'flatMap',
  'flatMapIndexed',
  'flatten',
  'mapTo',
  'mapNotNullTo',
  'flatMapTo',
]);
const RESULTS = new Map([
  ['toList', (element) => `List<${element}>`],
  ['toMutableList', (element) => `MutableList<${element}>`],
  ['asIterable', (element) => `Iterable<${element}>`],
  ['toSet', (element) => `Set<${element}>`],
  ['toMutableSet', (element) => `MutableSet<${element}>`],
  ['toHashSet', (element) => `HashSet<${element}>`],
  ['toSortedSet', (element) => `SortedSet<${element}>`],
  ['asSequence', (element) => `Sequence<${element}>`],
  ['stream', (element) => `Stream<${element}>`],
  ['iterator', (element) => `Iterator<${element}>`],
  ['chunked', (element) => `List<List<${element}>>`],
  ['windowed', (element) => `List<List<${element}>>`],
  ['withIndex', (element) => `Iterable<IndexedValue<${element}>>`],
  ['groupBy', (element) => `Map<Any,List<${element}>>`],
  ['partition', (element) => `Pair<List<${element}>,List<${element}>>`],
  ['associateBy', (element) => `Map<Any,${element}>`],
  ['associateWith', (element) => `Map<${element},Any>`],
  ['associate', () => 'Map<Any,Any>'],
  ['zip', (element) => `List<Pair<${element},Any>>`],
]);
const RECEIVER_FREE = new Set([
  'toList',
  'toMutableList',
  'toSet',
  'toMutableSet',
  'toHashSet',
  'toSortedSet',
  'chunked',
  'windowed',
]);
const BUILDERS = new Map([
  ['buildList', 'List<Any>'],
  ['buildSet', 'Set<Any>'],
  ['buildMap', 'Map<Any,Any>'],
]);
const PARTITIONS = new Set(['Lists', 'ListUtils', 'Iterables']);
const PAGED = /pag/iu;
const LISTED_FINDERS = /^(?:findAll|findAllBy\w*|findAllById|saveAll|saveAllAndFlush)$/u;
const TYPE_NAME = /^[A-Z]/u;
const PACKAGE = /^[a-z][\w.]*$/u;

function mapResult(ownerType, name) {
  const [key = 'Any', value = 'Any'] = typeArguments(ownerType);
  const results = new Map([
    ['mapValues', `Map<${key},Any>`],
    ['mapKeys', `Map<Any,${value}>`],
    ...[...MAP_VALUES].map((getter) => [getter, value]),
  ]);
  return results.get(name);
}

function collectionResult(ownerType, name) {
  const element = elementOf(ownerType) ?? 'Any';
  if (SAME_COLLECTION.has(name)) {
    return ownerType;
  }
  if (isMapType(ownerType) && mapResult(ownerType, name) !== undefined) {
    return mapResult(ownerType, name);
  }
  if (ELEMENTS.has(name) || (MAP_VALUES.has(name) && !isMapType(ownerType))) {
    return element;
  }
  return MAPPED.has(name) ? 'List<Any>' : RESULTS.get(name)?.(element);
}

function selfFunction(view, id, call) {
  const owner = view.chain(id).find(({ k }) => k === 'class')?.qualified ?? '';
  const owners = ownersOf(view.file, owner);
  const fn = view.file.functions.find(
    (candidate) =>
      candidate.name === call.name &&
      (owners.has(candidate.owner) || candidate.owner === '') &&
      acceptsArguments(candidate, call.arguments.length),
  );
  return fn === undefined ? undefined : returnTypeOf(view, fn);
}

function receiverless(view, id, call, head) {
  if (head !== undefined) {
    if (call.name === 'partition' && PARTITIONS.has(simpleName(head))) {
      return 'List<List<Any>>';
    }
    if (TYPE_NAME.test(call.name) && PACKAGE.test(head)) {
      return `${head}.${call.name}${call.typeArguments ?? ''}`;
    }
    return RECEIVER_FREE.has(call.name) ? collectionResult('List<Any>', call.name) : undefined;
  }
  const factory = factoryType(call.name) ?? BUILDERS.get(call.name);
  if (factory !== undefined) {
    return factory.includes('<') ? factory : `${factory}${call.typeArguments ?? ''}`;
  }
  if (TYPE_NAME.test(call.name)) {
    return `${call.name}${call.typeArguments ?? ''}`;
  }
  return selfFunction(view, id, call);
}

function declaredType(view, ownerType, call) {
  const fn = view
    .projectFunctions(ownerType, call.name)
    .find((candidate) => acceptsArguments(candidate, call.arguments.length));
  return fn === undefined ? undefined : returnTypeOf(view, fn);
}

function inheritedType(call) {
  if (!LISTED_FINDERS.test(call.name)) {
    return undefined;
  }
  return call.arguments.some(({ text }) => PAGED.test(text)) ? 'Page<Any>' : 'List<Any>';
}

export function callResult(view, id, ownerType, call, head) {
  if (ownerType === undefined) {
    return receiverless(view, id, call, head);
  }
  if (SAME_RECEIVER.has(call.name)) {
    return ownerType;
  }
  if (isCollectionType(ownerType)) {
    return collectionResult(ownerType, call.name);
  }
  if (QUERY_CREATORS.has(call.name) && view.is(ownerType, ENTITY_MANAGER)) {
    return QUERY;
  }
  if (QUERY_SETTERS.has(call.name) && view.is(ownerType, QUERY_TYPES)) {
    return ownerType;
  }
  return (
    declaredType(view, typeName(ownerType), call) ??
    (view.isRepository(ownerType) ? inheritedType(call) : undefined) ??
    (RECEIVER_FREE.has(call.name) ? collectionResult('List<Any>', call.name) : undefined)
  );
}
