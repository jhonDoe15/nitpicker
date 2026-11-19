export type Kind = 'list' | 'set' | 'map' | 'queue' | 'date' | 'bitset';

const QUEUE: Kind = 'queue';
const DATE: Kind = 'date';
const BITSET: Kind = 'bitset';
const CLEAR = 'clear';

type Forms = { readonly java: string; readonly kotlin: string };

const COLLECTION_MUTATORS = [
  'add',
  'addAll',
  'addFirst',
  'addLast',
  'remove',
  'removeAll',
  'removeIf',
  'removeFirst',
  'removeLast',
  'retainAll',
  CLEAR,
  'sort',
  'replaceAll',
  'set',
  'push',
  'pop',
  'poll',
  'pollFirst',
  'pollLast',
  'offer',
  'offerFirst',
  'offerLast',
  'put',
  'putAll',
  'putIfAbsent',
  'compute',
  'computeIfAbsent',
  'computeIfPresent',
  'merge',
  'replace',
];
const KOTLIN_MUTATORS = [
  'removeAt',
  'sortBy',
  'sortByDescending',
  'sortWith',
  'sortDescending',
  'reverse',
  'shuffle',
  'fill',
  'getOrPut',
  'plusAssign',
  'minusAssign',
];

const MUTATORS: ReadonlyMap<Kind, ReadonlySet<string>> = new Map([
  ['list', new Set([...COLLECTION_MUTATORS, ...KOTLIN_MUTATORS])],
  ['set', new Set([...COLLECTION_MUTATORS, ...KOTLIN_MUTATORS])],
  ['map', new Set([...COLLECTION_MUTATORS, ...KOTLIN_MUTATORS])],
  [QUEUE, new Set(COLLECTION_MUTATORS)],
  [
    DATE,
    new Set([
      'setTime',
      'setYear',
      'setMonth',
      'setDate',
      'setHours',
      'setMinutes',
      'setSeconds',
      'set',
      'add',
      'roll',
      'setTimeInMillis',
      'setTimeZone',
      'setLenient',
      CLEAR,
    ]),
  ],
  [BITSET, new Set(['set', CLEAR, 'flip', 'and', 'or', 'xor', 'andNot'])],
]);

const KIND_OF_TYPE = new Map<string, Kind>([
  ...['List', 'ArrayList', 'LinkedList', 'Vector', 'Stack', 'MutableList'].map(
    (name): [string, Kind] => [name, 'list'],
  ),
  ...['Collection', 'MutableCollection', 'Queue', 'Deque', 'ArrayDeque', 'PriorityQueue'].map(
    (name): [string, Kind] => [name, QUEUE],
  ),
  ...['Set', 'HashSet', 'LinkedHashSet', 'TreeSet', 'SortedSet', 'NavigableSet', 'MutableSet'].map(
    (name): [string, Kind] => [name, 'set'],
  ),
  ...[
    'Map',
    'HashMap',
    'LinkedHashMap',
    'TreeMap',
    'SortedMap',
    'NavigableMap',
    'ConcurrentMap',
    'MutableMap',
  ].map((name): [string, Kind] => [name, 'map']),
  ...['Date', 'Calendar', 'GregorianCalendar'].map((name): [string, Kind] => [name, DATE]),
  ['BitSet', BITSET],
]);

const FORMS = new Map<Kind, Forms>([
  [
    'list',
    {
      java: '`List.copyOf(x)`, `Stream.toList()` or a new `ArrayList<>(x)` filled before it is returned',
      kotlin:
        '`buildList { addAll(x); ... }`, `x + item` or `x.toMutableList()` filled before it is returned',
    },
  ],
  [
    QUEUE,
    {
      java: '`List.copyOf(x)`, `Stream.toList()` or a new `ArrayDeque<>(x)` filled before it is returned',
      kotlin: '`buildList { addAll(x); ... }` or `ArrayDeque(x)` filled before it is returned',
    },
  ],
  [
    'set',
    {
      java: '`Set.copyOf(x)`, `Collectors.toUnmodifiableSet()` or a new `HashSet<>(x)` filled before it is returned',
      kotlin:
        '`buildSet { addAll(x); ... }`, `x + item` or `x.toMutableSet()` filled before it is returned',
    },
  ],
  [
    'map',
    {
      java: '`Map.copyOf(x)`, `Collectors.toUnmodifiableMap(...)` or a new `HashMap<>(x)` filled before it is returned',
      kotlin:
        '`buildMap { putAll(x); ... }`, `x + (key to value)` or `x.toMutableMap()` filled before it is returned',
    },
  ],
  [
    DATE,
    {
      java: 'a `java.time` value (`Instant.plus(...)`, `LocalDate.withDayOfMonth(...)`) built from it',
      kotlin:
        'a `java.time` value (`Instant.plus(...)`, `LocalDate.withDayOfMonth(...)`) built from it',
    },
  ],
  [
    BITSET,
    {
      java: 'a `BitSet.valueOf(x.toLongArray())` copy changed before it is returned',
      kotlin: 'a `BitSet.valueOf(x.toLongArray())` copy changed before it is returned',
    },
  ],
]);

export function kindOfType(type: string | undefined): Kind | undefined {
  return type === undefined ? undefined : KIND_OF_TYPE.get(type);
}

export function mutates(kind: Kind, method: string): boolean {
  return MUTATORS.get(kind)?.has(method) === true;
}

export function javaFormsOf(kind: Kind): string {
  return FORMS.get(kind)?.java ?? '';
}

export function kotlinFormsOf(kind: Kind): string {
  return FORMS.get(kind)?.kotlin ?? '';
}
