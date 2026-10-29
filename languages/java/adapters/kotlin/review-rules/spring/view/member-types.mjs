import { typeArguments, typeName } from '../spring-names.mjs';
import { BEAN_FACTORIES } from '../spring-types.mjs';

export const MAPS = new Set([
  'Map',
  'MutableMap',
  'HashMap',
  'LinkedHashMap',
  'TreeMap',
  'SortedMap',
  'NavigableMap',
  'ConcurrentHashMap',
]);
export const COLLECTIONS = new Set([
  ...MAPS,
  'List',
  'MutableList',
  'ArrayList',
  'LinkedList',
  'Set',
  'MutableSet',
  'HashSet',
  'LinkedHashSet',
  'SortedSet',
  'NavigableSet',
  'TreeSet',
  'Collection',
  'MutableCollection',
  'Iterable',
  'MutableIterable',
  'Sequence',
  'Array',
  'Queue',
  'Deque',
  'ArrayDeque',
  'Stream',
  'Iterator',
  'IntRange',
  'LongRange',
  'Page',
  'Slice',
  'Streamable',
]);
const ENTRIES = new Set(['Entry', 'MutableEntry']);
const COMPONENTS = new Map([
  ['Pair', ['first', 'second']],
  ['Triple', ['first', 'second', 'third']],
  ['IndexedValue', ['index', 'value']],
]);
const PAGES = new Set(['Page', 'Slice']);

export function simpleName(type) {
  return typeName(type).split('.').at(-1);
}

export function isCollectionType(type) {
  return type !== undefined && COLLECTIONS.has(simpleName(type));
}

export function isMapType(type) {
  return type !== undefined && MAPS.has(simpleName(type));
}

export function elementOf(type) {
  const [first, second] = typeArguments(type);
  if (isMapType(type)) {
    return `Map.Entry<${first ?? 'Any'},${second ?? 'Any'}>`;
  }
  return first;
}

function componentNames(type) {
  const name = simpleName(type);
  return ENTRIES.has(name) ? ['key', 'value'] : COMPONENTS.get(name);
}

function fieldType(type, field) {
  if (field === 'index') {
    return 'Int';
  }
  const names = componentNames(type) ?? [];
  const position = names.indexOf(field);
  const types =
    simpleName(type) === 'IndexedValue' ? ['Int', ...typeArguments(type)] : typeArguments(type);
  return position < 0 ? undefined : types[position];
}

export function componentOf(type, component) {
  if (type === undefined) {
    return undefined;
  }
  const names = componentNames(type);
  if (names !== undefined) {
    return fieldType(type, names[component - 1]);
  }
  return isCollectionType(type) && !isMapType(type) ? typeArguments(type)[0] : undefined;
}

function mapView(ownerType, member) {
  const [key, value] = typeArguments(ownerType);
  const views = new Map([
    ['keys', `Set<${key ?? 'Any'}>`],
    ['values', `Collection<${value ?? 'Any'}>`],
    ['entries', `Set<Map.Entry<${key ?? 'Any'},${value ?? 'Any'}>>`],
  ]);
  return views.get(member);
}

export function memberOf(view, ownerType, member) {
  if (isMapType(ownerType) && mapView(ownerType, member) !== undefined) {
    return mapView(ownerType, member);
  }
  if (componentNames(ownerType)?.includes(member)) {
    return fieldType(ownerType, member);
  }
  if (PAGES.has(simpleName(ownerType)) && member === 'content') {
    return `List<${typeArguments(ownerType)[0] ?? 'Any'}>`;
  }
  if (member === 'environment' && view.is(ownerType, BEAN_FACTORIES)) {
    return 'org.springframework.core.env.Environment';
  }
  return view.memberTypeOf(ownerType, member);
}
