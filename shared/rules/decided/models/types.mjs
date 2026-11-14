import { nodesOf } from '../../../near-duplicates/tree/nodes.mjs';

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

/** 'string', 'list', 'collection', 'array', 'optional', 'float' or the type's own name. */
export function kindOfType(text) {
  if (text.endsWith('[]')) {
    return 'array';
  }
  const name = baseName(text);
  const kinds = [
    ['string', STRINGS],
    ['list', LISTS],
    ['collection', COLLECTIONS],
    ['array', ARRAYS],
    ['optional', OPTIONALS],
    ['float', FLOATS],
  ];
  return kinds.find(([, names]) => names.has(name))?.[0] ?? name;
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
  return kind === 'list' || kind === 'collection';
}
