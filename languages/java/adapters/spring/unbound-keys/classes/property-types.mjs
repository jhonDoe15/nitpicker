const MAP_TYPES = new Set([
  'Map',
  'HashMap',
  'LinkedHashMap',
  'TreeMap',
  'SortedMap',
  'NavigableMap',
  'EnumMap',
  'ConcurrentMap',
  'ConcurrentHashMap',
  'Properties',
  'MultiValueMap',
  'LinkedMultiValueMap',
  'MutableMap',
]);
const COLLECTION_TYPES = new Set([
  'List',
  'ArrayList',
  'LinkedList',
  'Set',
  'HashSet',
  'LinkedHashSet',
  'TreeSet',
  'SortedSet',
  'Collection',
  'Iterable',
  'MutableList',
  'MutableSet',
  'MutableCollection',
  'Array',
  'Optional',
]);
const SCALAR_TYPES = new Set([
  'String',
  'CharSequence',
  'Char',
  'Character',
  'Boolean',
  'boolean',
  'Byte',
  'byte',
  'Short',
  'short',
  'Int',
  'Integer',
  'int',
  'Long',
  'long',
  'Float',
  'float',
  'Double',
  'double',
  'char',
  'BigDecimal',
  'BigInteger',
  'Number',
  'Duration',
  'Period',
  'DataSize',
  'DataUnit',
  'Charset',
  'Locale',
  'TimeZone',
  'ZoneId',
  'UUID',
  'Pattern',
  'Regex',
  'Resource',
  'URI',
  'URL',
  'InetAddress',
  'File',
  'Path',
  'Class',
  'KClass',
  'Instant',
  'LocalDate',
  'LocalTime',
  'LocalDateTime',
  'OffsetDateTime',
  'ZonedDateTime',
  'ChronoUnit',
  'TimeUnit',
  'MimeType',
  'MediaType',
  'HttpMethod',
  'HttpStatus',
  'IntArray',
  'LongArray',
  'BooleanArray',
  'ByteArray',
  'CharArray',
  'DoubleArray',
  'FloatArray',
  'ShortArray',
]);

function kindOf(simple) {
  if (MAP_TYPES.has(simple)) {
    return 'map';
  }
  if (COLLECTION_TYPES.has(simple)) {
    return 'collection';
  }
  return SCALAR_TYPES.has(simple) ? 'scalar' : 'class';
}

export function typeParts(type) {
  const clean = (type ?? '')
    .replaceAll(/@[\w.]+/gu, '')
    .replaceAll('?', '')
    .trim();
  const generic = clean.indexOf('<');
  const base = (generic < 0 ? clean : clean.slice(0, generic)).replace(/\[\s*\]/gu, '').trim();
  const simple = base.slice(base.lastIndexOf('.') + 1);
  const argument = generic < 0 ? '' : clean.slice(generic + 1, clean.lastIndexOf('>'));
  return {
    simple,
    kind: kindOf(simple),
    argument,
    array: /\[\s*\]\s*$/u.test(clean),
    known: clean !== '',
  };
}

export function lastArgument(argument) {
  let depth = 0;
  let start = 0;
  for (const [index, character] of [...argument].entries()) {
    depth += character === '<' ? 1 : 0;
    depth -= character === '>' ? 1 : 0;
    start = character === ',' && depth === 0 ? index + 1 : start;
  }
  return argument
    .slice(start)
    .replace(/^\s*(?:out|in)\s+/u, '')
    .trim();
}
