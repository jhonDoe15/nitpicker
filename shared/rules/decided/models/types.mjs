import { nodesOf } from '../../../near-duplicates/tree/nodes.mjs';

const COLLECTION = 'collection';

const DECLARING = new Set(['parameter', 'declare', 'foreach']);
const STRINGS = new Set(['String', 'CharSequence', 'StringBuilder', 'StringBuffer']);
const LISTS = new Set([
  'List',
  'ArrayList',
  'LinkedList',
  'MutableList',
  'Vector',
  'Stack',
  'CopyOnWriteArrayList',
]);
const COLLECTIONS = new Set([
  'Collection',
  'Set',
  'HashSet',
  'LinkedHashSet',
  'TreeSet',
  'SortedSet',
  'NavigableSet',
  'MutableSet',
  'MutableCollection',
  'Map',
  'HashMap',
  'LinkedHashMap',
  'TreeMap',
  'SortedMap',
  'NavigableMap',
  'MutableMap',
  'ConcurrentHashMap',
  'Deque',
  'ArrayDeque',
  'Queue',
  'PriorityQueue',
  'EnumMap',
]);
const ARRAYS = new Set([
  'Array',
  'IntArray',
  'LongArray',
  'ShortArray',
  'ByteArray',
  'CharArray',
  'FloatArray',
  'DoubleArray',
  'BooleanArray',
]);
const OPTIONALS = new Set(['Optional', 'OptionalInt', 'OptionalLong', 'OptionalDouble']);
const FLOATS = new Set(['double', 'float', 'Double', 'Float']);
const GENERICS = /<.*$/u;

function baseName(text) {
  const bare = text.replace(GENERICS, '').replace(/\?$/u, '').trim();
  return bare.slice(bare.lastIndexOf('.') + 1);
}

const LIBRARY_PACKAGES = new Set(['java.util', 'java.util.concurrent', 'kotlin.collections']);
const LIBRARY_PREFIX = /^(?:java\.util|kotlin\.collections)\./u;
const LIBRARY_KINDS = new Set(['list', COLLECTION, 'optional']);
const KOTLIN_COLLECTIONS = new Set([
  'List',
  'MutableList',
  'Set',
  'MutableSet',
  'Map',
  'MutableMap',
  'Collection',
  'MutableCollection',
  'ArrayList',
  'HashMap',
  'HashSet',
  'LinkedHashMap',
  'LinkedHashSet',
  'ArrayDeque',
]);

function packageOf(importText) {
  return importText.slice(0, importText.lastIndexOf('.'));
}

function isLibraryType(name, text, { imports, classes, kotlin }) {
  const named = text.replace(GENERICS, '');
  const imported = imports.names.some(
    (entry) => entry.endsWith(`.${name}`) && LIBRARY_PACKAGES.has(packageOf(entry)),
  );
  const unclaimed = !(classes.has(name) || imports.classes.includes(name));
  const starred = imports.stars.some((star) => LIBRARY_PACKAGES.has(star));
  return (
    LIBRARY_PREFIX.test(named) ||
    imported ||
    (unclaimed && (starred || (kotlin && KOTLIN_COLLECTIONS.has(name))))
  );
}

function kindNamed(name) {
  const kinds = [
    ['string', STRINGS],
    ['list', LISTS],
    [COLLECTION, COLLECTIONS],
    ['array', ARRAYS],
    ['optional', OPTIONALS],
    ['float', FLOATS],
  ];
  return kinds.find(([, names]) => names.has(name))?.[0] ?? name;
}

/**
 * 'string', 'list', COLLECTION, 'array', 'optional', 'float' or the type's own name. With a
 * `resolver` (`imports` of the file, project `classes`, `kotlin`), a collection or optional type
 * counts only when it resolves to the library type.
 */
export function kindOfType(text, resolver) {
  if (text.endsWith('[]')) {
    return 'array';
  }
  const name = baseName(text);
  const kind = kindNamed(name);
  const isLibrary = LIBRARY_KINDS.has(kind);
  return isLibrary && resolver !== undefined && !isLibraryType(name, text, resolver) ? name : kind;
}

/** The declared type text of each name that every declaration in `tree` types the same way. */
export function declaredTypes(tree) {
  const declared = nodesOf(tree).filter(
    (node) => DECLARING.has(node.kind) && node.children[1]?.kind === 'name',
  );
  const types = new Map();
  for (const {
    children: [type, name],
  } of declared) {
    const text = type.kind === 'type' ? type.value : '';
    types.set(name.value, types.has(name.value) && types.get(name.value) !== text ? '' : text);
  }
  return new Map([...types].filter(([, text]) => text !== ''));
}

export function isCollectionKind(kind) {
  return kind === 'list' || kind === COLLECTION;
}
