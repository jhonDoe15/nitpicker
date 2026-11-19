import { QUERY_TYPES } from '../data/data-types.mts';
import { typeArguments, typeName } from '../spring-names.mts';
import { acceptsArguments, factoryType, returnTypeOf } from '../spring-scopes.mts';
import { ENTITY_MANAGER } from '../spring-types.mts';
import { lambdaParts, normalized } from './expressions.mts';
import { elementOf, isCollectionType, isMapType, memberOf, simpleName } from './member-types.mts';
import { ownersOf } from './project-types.mts';
import type { Argument, Call, CallSite, SpringView } from '../typed/spring-shapes.mts';

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
const RESULTS = new Map<string, (element: string) => string>([
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
const BUILDERS = new Map<string, string>([
  ['buildList', 'List<Any>'],
  ['buildSet', 'Set<Any>'],
  ['buildMap', 'Map<Any,Any>'],
]);
const PARTITIONS = new Set(['Lists', 'ListUtils', 'Iterables']);
const PAGED = /pag/iu;
const LISTED_FINDERS = /^(?:findAll|findAllBy\w*|saveAll|saveAllAndFlush)$/u;
const TYPE_NAME = /^[A-Z]/u;
const MEMBER_CHAIN = /^[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*$/u;
const LAMBDA_VALUES = new Map<string, LambdaShape>([
  ['map', { lambda: 0, result: (value) => `List<${value}>` }],
  ['mapNotNull', { lambda: 0, result: (value) => `List<${value.replace(/\?$/u, '')}>` }],
  ['flatMap', { lambda: 0, result: listOfElement }],
  ['zip', { lambda: 0, result: (value) => `List<${value}>` }],
  ['associateWith', { lambda: 0, result: (value, element) => `Map<${element},${value}>` }],
  ['associateBy', { lambda: 1, result: (value) => `Map<Any,${value}>` }],
]);
const PACKAGE = /^[a-z][\w.]*$/u;

type LambdaShape = {
  lambda: number;
  result: (value: string, element: string) => string | undefined;
};

function listOfElement(value: string): string | undefined {
  const element = elementOf(value);
  return element === undefined || element === '' ? element : `List<${element}>`;
}

function mapResult(ownerType: string, name: string): string | undefined {
  const [key = 'Any', value = 'Any'] = typeArguments(ownerType);
  const results = new Map<string, string>([
    ['mapValues', `Map<${key},Any>`],
    ['mapKeys', `Map<Any,${value}>`],
    ...[...MAP_VALUES].map((getter): [string, string] => [getter, value]),
  ]);
  return results.get(name);
}

function collectionResult(ownerType: string, name: string): string | undefined {
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

function lambdaValue(
  view: SpringView,
  lambda: Argument | undefined,
  parameterTypes: string[],
): string | undefined {
  const parts = lambdaParts(lambda?.text);
  const body = normalized(parts?.body);
  if (parts === undefined || !MEMBER_CHAIN.test(body)) {
    return undefined;
  }
  const [head, ...members] = body.split('.');
  const index = head === undefined ? -1 : parts.params.indexOf(head);
  return members.reduce<string | undefined>(
    (type, member) => (type === undefined ? undefined : memberOf(view, type, member)),
    index < 0 ? undefined : parameterTypes[index],
  );
}

function lambdaResult(view: SpringView, ownerType: string, call: Call): string | undefined {
  const shape = LAMBDA_VALUES.get(call.name);
  const lambdas = call.arguments.filter(({ text }) => text.trim().startsWith('{'));
  const element = elementOf(ownerType);
  if (shape === undefined || element === undefined || lambdas.length !== shape.lambda + 1) {
    return undefined;
  }
  const value = lambdaValue(view, lambdas[shape.lambda], [element]);
  return value === undefined ? undefined : (shape.result(value, element) ?? undefined);
}

function selfFunction(view: SpringView, id: number | undefined, call: Call): string | undefined {
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

function receiverless(view: SpringView, { id, call, head }: CallSite): string | undefined {
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

function declaredType(view: SpringView, ownerType: string, call: Call): string | undefined {
  const fn = view
    .projectFunctions(ownerType, call.name)
    .find((candidate) => acceptsArguments(candidate, call.arguments.length));
  return fn === undefined ? undefined : returnTypeOf(view, fn);
}

function inheritedType(call: Call): string | undefined {
  if (!LISTED_FINDERS.test(call.name)) {
    return undefined;
  }
  return call.arguments.some(({ text }) => PAGED.test(text)) ? 'Page<Any>' : 'List<Any>';
}

export function callResult(
  view: SpringView,
  site: CallSite,
  ownerType: string | undefined,
): string | undefined {
  const { call } = site;
  if (ownerType === undefined) {
    return receiverless(view, site);
  }
  if (SAME_RECEIVER.has(call.name)) {
    return ownerType;
  }
  if (isCollectionType(ownerType)) {
    return lambdaResult(view, ownerType, call) ?? collectionResult(ownerType, call.name);
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
