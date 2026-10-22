import {
  ACCEPTED_MANAGER_ROLES,
  GENERIC_NAME_WORDS,
} from '../../../../../../shared/naming/smell-words.mjs';
import { braceDepths, closingIndex, parenDepths } from '../kotlin-source.mjs';

const OBJECT_BODY =
  /(?<![\w.])(?:companion\s+object(?:\s+[A-Za-z_]\w*)?|object\s+[A-Za-z_]\w*)(?:\s*:[^{}=]*|\s*)\{/g;
const PROPERTY_MODIFIERS =
  'private|public|internal|protected|override|lateinit|@Volatile|@JvmStatic|@JvmField';
const PROPERTY = new RegExp(
  [
    String.raw`^[ \t]*(?:@[\w.:]+(?:\([^)\n]*\))?\s+)*(?:(?:${PROPERTY_MODIFIERS})\s+)*`,
    String.raw`(const\s+)?(val|var)\s+(?:\`[^\`]+\`|([A-Za-z_]\w*))((?:[^\w\n][^\n]*)?)$`,
  ].join(''),
  'gm',
);
const DELEGATION = /\sby\s/;
const MUTABLE_FACTORIES = [
  'mutableListOf',
  'mutableMapOf',
  'mutableSetOf',
  'arrayListOf',
  'hashMapOf',
  'hashSetOf',
  'linkedMapOf',
  'linkedSetOf',
  'sortedMapOf',
  'sortedSetOf',
  'arrayOf',
  'intArrayOf',
  'longArrayOf',
  'doubleArrayOf',
  'byteArrayOf',
  'ArrayList',
  'HashMap',
  'HashSet',
  'LinkedHashMap',
  'LinkedHashSet',
  'TreeMap',
  'TreeSet',
  'ArrayDeque',
  'LinkedList',
  'PriorityQueue',
  'ConcurrentHashMap',
  'ConcurrentLinkedQueue',
  'CopyOnWriteArrayList',
  'AtomicInteger',
  'AtomicLong',
  'AtomicBoolean',
  'AtomicReference',
  'IntArray',
  'LongArray',
  'DoubleArray',
  'ByteArray',
  'StringBuilder',
  'MutableStateFlow',
  'MutableSharedFlow',
];
const JAVA_UTIL = String.raw`(?:java\.util\.(?:concurrent\.(?:atomic\.)?)?)?`;
const MUTABLE_FACTORY = new RegExp(
  String.raw`^${JAVA_UTIL}(?:${MUTABLE_FACTORIES.join('|')})\b\s*(?:<[^>]*>\s*)?[({]`,
);
const MUTABLE_TYPES =
  'Mutable\\w+|Array|IntArray|LongArray|DoubleArray|ByteArray|ArrayList|HashMap|HashSet|StringBuilder|Atomic\\w+';
const MUTABLE_TYPE = new RegExp(String.raw`^\s*:\s*(?:${MUTABLE_TYPES})\b`);

function capitalized(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const GENERIC_WORDS = new Set(GENERIC_NAME_WORDS);
const GENERIC_SUFFIX = GENERIC_NAME_WORDS.map(capitalized).join('|');
const GENERIC_TYPE = new RegExp(`(?:^|[A-Za-z0-9])(${GENERIC_SUFFIX})$`);
const FILE_STEM = /([^/]+?)(?:\.[A-Za-z][A-Za-z0-9]*)?\.kt$/;
const WORD_BOUNDARIES = [/([a-z0-9])([A-Z])/g, /([A-Z]+)([A-Z][a-z])/g];
const MANAGER_ROLES = new Set(ACCEPTED_MANAGER_ROLES);
const MANAGER_WORDS = new Set(['manager', 'managers']);
const ACCEPTED_MANAGER = new RegExp(
  `(?:${ACCEPTED_MANAGER_ROLES.map(capitalized).join('|')})Managers?$`,
);
const VERSION_WORD = /^v?$/;
const TYPE_MODIFIERS =
  'data|sealed|abstract|open|enum|annotation|inner|value|fun|private|internal|public|protected';
const TYPE_DECLARATION = new RegExp(
  [
    String.raw`(?<![\w.])(?:(?:${TYPE_MODIFIERS})\s+)*`,
    String.raw`(?:class|interface|object|typealias)\s+\`?([A-Z]\w*)\`?(?:\s*<[^>]*>)?([^{\n]*)`,
  ].join(''),
  'g',
);
const GENERIC_PACKAGE = new RegExp(`(?:^|\\.)(?:${GENERIC_NAME_WORDS.join('|')})(?:\\.|$)`);
const PACKAGE = /^\s*package\s+([\w.`]+)/m;

export const DECLARATION_MESSAGES = {
  MutableModuleState:
    'Keep state in an instance: a class whose object the composition root creates and passes in, holding `val`s and immutable `listOf`/`mapOf`. A top-level `var` or a mutable collection in an `object` is shared by the whole program.',
  GenericTypeName:
    'Name this type for what it does (`PriceRounder`, `OrderTotals`), not Utils, Helper, Manager, Common or Misc. Pure logic shared between features goes in the shared package under such a name.',
  GenericFileName:
    'Name this file for what it holds (`PriceRounding.kt`), not Utils, Helper, Manager, Common or Misc. Pure logic shared between features goes in the shared package under such a name.',
  GenericPackageName:
    'Name this package for what it holds, not utils, helpers, common or misc. Pure logic shared between features goes in the shared package under a name that says what it does.',
};

function objectBodies(code) {
  return [...code.matchAll(OBJECT_BODY)].map((match) => {
    const open = match.index + match[0].length - 1;
    return { open, close: closingIndex(code, open) };
  });
}

function declarationParts(rest) {
  const marks = [rest.indexOf('='), rest.search(DELEGATION)].filter((index) => index !== -1);
  const at = marks.length === 0 ? rest.length : Math.min(...marks);
  const head = rest.slice(0, at);
  if (head.trim() !== '' && !head.trimStart().startsWith(':')) {
    return undefined;
  }
  const type = head.trim() === '' ? undefined : head;
  if (at === rest.length) {
    return { type };
  }
  return rest[at] === '='
    ? { type, assign: '=', value: rest.slice(at + 1) }
    : { type, assign: 'by' };
}

function isMutable({ keyword, type, value }) {
  if (keyword === 'var') {
    return true;
  }
  return (type !== undefined && MUTABLE_TYPE.test(type)) || MUTABLE_FACTORY.test(value ?? '');
}

export function mutableModuleState(scanned) {
  const { code } = scanned;
  const depths = braceDepths(code);
  const parens = parenDepths(code);
  const bodies = objectBodies(code);
  return [...code.matchAll(PROPERTY)].flatMap((match) => {
    const [, constant, keyword, name, rest] = match;
    const parts = declarationParts(rest);
    if (parts === undefined) {
      return [];
    }
    const { type, assign, value } = parts;
    const offset = match.index + match[0].search(/\S/);
    const depth = depths[offset];
    const inObject = bodies.some(
      ({ open, close }) => open < offset && offset < close && depth === depths[open] + 1,
    );
    const property = { keyword, type, value: assign === '=' ? value.trim() : undefined };
    const declared = parens[offset] === 0 && (depth === 0 || inObject);
    if (constant !== undefined || !declared || !isMutable(property)) {
      return [];
    }
    return [{ rule: 'MutableModuleState', offset, subject: name ?? match[0].trim() }];
  });
}

function supertypeNames(header) {
  const colon = header.indexOf(':');
  if (colon === -1) {
    return [];
  }
  return header
    .slice(colon + 1)
    .split(',')
    .map((part) => /([A-Z]\w*)\s*(?:<[^>]*>)?\s*(?:\(|$|\s|by\b)/.exec(part.trim())?.[1])
    .filter((name) => name !== undefined);
}

function nameWords(name) {
  const spaced = WORD_BOUNDARIES.reduce((text, boundary) => text.replace(boundary, '$1 $2'), name);
  return spaced
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.toLowerCase().replace(/\d+$/, ''))
    .filter((word) => word !== '' && !VERSION_WORD.test(word));
}

function isGenericFile(stem) {
  const words = nameWords(stem);
  const last = words.at(-1);
  const managerRole = MANAGER_WORDS.has(last) && MANAGER_ROLES.has(words.at(words.length - 2));
  return GENERIC_WORDS.has(last) && !managerRole;
}

function fileFindings(file, declaredNames) {
  const stem = FILE_STEM.exec(file ?? '')?.[1];
  const declared = declaredNames.some((name) => name.toLowerCase() === stem?.toLowerCase());
  return stem === undefined || declared || !isGenericFile(stem)
    ? []
    : [{ rule: 'GenericFileName', offset: 0, subject: stem }];
}

function declaredTypes(code) {
  return [...code.matchAll(TYPE_DECLARATION)].map((match) => ({
    name: match[1],
    header: match[2],
    offset: match.index,
  }));
}

function isGenericType({ name, header }) {
  const suffix = GENERIC_TYPE.exec(name.replace(/\d+$/, ''))?.[1];
  return (
    suffix !== undefined &&
    !ACCEPTED_MANAGER.test(name) &&
    !supertypeNames(header).some((supertype) => supertype.endsWith(suffix))
  );
}

function packageFindings(code) {
  const declared = PACKAGE.exec(code);
  const packageName = declared?.[1].replaceAll('`', '');
  return packageName !== undefined && GENERIC_PACKAGE.test(packageName)
    ? [{ rule: 'GenericPackageName', offset: declared.index, subject: packageName }]
    : [];
}

export function genericNames(scanned, context = {}) {
  const types = declaredTypes(scanned.code);
  const typeFindings = types
    .filter(isGenericType)
    .map(({ name, offset }) => ({ rule: 'GenericTypeName', offset, subject: name }));
  const names = types.map(({ name }) => name);
  return [...fileFindings(context.file, names), ...packageFindings(scanned.code), ...typeFindings];
}
