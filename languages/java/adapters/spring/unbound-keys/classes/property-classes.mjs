import { classesIn } from './class-members.mjs';
import { closingIndex } from './source-structure.mjs';

const BINDING = /@(?:[\w.]*\.)?ConfigurationProperties\b\s*/gu;
const TARGET_CLASS =
  /^\s*(?:@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?\s*|(?:public|protected|private|internal|final|abstract|open|static|data|sealed)\s+)*(?:class|record)\s+(\w+)/u;
const MAX_DEPTH = 8;
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

function typeParts(type) {
  const clean = (type ?? '')
    .replaceAll(/@[\w.]+/gu, '')
    .replaceAll('?', '')
    .trim();
  const generic = clean.indexOf('<');
  const base = (generic < 0 ? clean : clean.slice(0, generic)).replace(/\[\s*\]/gu, '').trim();
  const simple = base.slice(base.lastIndexOf('.') + 1);
  const argument = generic < 0 ? '' : clean.slice(generic + 1, clean.lastIndexOf('>'));
  return { simple, argument, array: /\[\s*\]\s*$/u.test(clean), known: clean !== '' };
}

function lastArgument(argument) {
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

function kebab(name) {
  return name.replaceAll(/(?<=[a-z\d])([A-Z])/gu, '-$1').toLowerCase();
}

function addMember(context, { key, type, depth }) {
  const { simple, argument, array, known } = typeParts(type);
  context.exact.add(key);
  if (!known || MAP_TYPES.has(simple) || simple === 'Object' || simple === 'Any') {
    context.open.add(key);
  } else if (array) {
    addMember(context, { key, type: type.replace(/\[\s*\]\s*$/u, ''), depth });
  } else if (COLLECTION_TYPES.has(simple)) {
    addMember(context, { key, type: lastArgument(argument) || undefined, depth });
  } else if (!SCALAR_TYPES.has(simple)) {
    addClass(context, { prefix: key, name: simple, depth: depth + 1 });
  }
}

function addClass(context, { prefix, name, depth }) {
  const declared = context.classes.get(name) ?? [];
  const bindable = declared.filter(({ kind }) => kind !== 'interface');
  if (bindable.length === 0 || depth > MAX_DEPTH) {
    context.open.add(prefix);
    return;
  }
  if (bindable.every(({ kind }) => kind === 'enum')) {
    return;
  }
  context.groups.add(prefix);
  for (const declaration of bindable) {
    for (const { name: member, type } of declaration.members) {
      addMember(context, { key: `${prefix}.${kebab(member)}`, type, depth });
    }
    if (declaration.superclass !== undefined) {
      addClass(context, {
        prefix,
        name: declaration.superclass.split('.').at(-1),
        depth: depth + 1,
      });
    }
  }
}

function prefixOf(argumentsText) {
  const named = /\b(?:prefix|value)\s*=\s*"([^"]*)"/u.exec(argumentsText);
  return (named ?? /^\s*"([^"]*)"/u.exec(argumentsText))?.[1];
}

function bindingsIn({ text, code }) {
  return [...code.matchAll(BINDING)].flatMap((match) => {
    const after = match.index + match[0].length;
    const close = code[after] === '(' ? closingIndex(code, after) : after - 1;
    const prefix = code[after] === '(' ? prefixOf(text.slice(after + 1, close)) : undefined;
    const target = TARGET_CLASS.exec(code.slice(close + 1));
    return prefix === undefined || prefix.trim() === ''
      ? []
      : [{ prefix: prefix.trim(), target: target?.[1] }];
  });
}

function classIndex(sources) {
  const classes = new Map();
  for (const declaration of sources.flatMap(classesIn)) {
    classes.set(declaration.name, [...(classes.get(declaration.name) ?? []), declaration]);
  }
  return classes;
}

export function propertyClassKeys(sources) {
  const context = {
    classes: classIndex(sources),
    exact: new Set(),
    open: new Set(),
    groups: new Set(),
  };
  for (const { prefix, target } of sources.flatMap(bindingsIn)) {
    if (target === undefined) {
      context.open.add(prefix);
    } else {
      addClass(context, { prefix, name: target, depth: 0 });
    }
  }
  return { owned: [...context.groups], exact: [...context.exact], open: [...context.open] };
}
