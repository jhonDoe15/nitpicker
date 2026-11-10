import { closingIndex } from '../kotlin-source.mjs';

const NAME_BEFORE = /([A-Za-z_]\w*)\s*$/;
const QUALIFIER_BEFORE = /([A-Za-z_]\w*)(?:\s|!|\?)*\.\s*$/;
const CALL_BEFORE = /(?:\s|!|\?)*\.\s*$/;
export const LOOKBEHIND = 200;

const OPENING_CONSTRUCTOR = new RegExp(
  String.raw`(?<![\w.])(?:java\.(?:io|net|util\.jar|util\.zip)\.)?` +
    String.raw`(FileInputStream|FileOutputStream|FileReader|FileWriter|RandomAccessFile|JarFile|ZipFile|` +
    String.raw`URLClassLoader|Socket|ServerSocket)\s*\(`,
  'g',
);
const NEEDS_ARGUMENTS = new Set(['Socket', 'ServerSocket']);
const OPENING_STATIC = new RegExp(
  String.raw`(?<![\w.])(?:java\.nio\.(?:file|channels)\.)?(?:Files\s*\.\s*(?:newInputStream|newOutputStream|` +
    String.raw`newBufferedReader|newBufferedWriter|newByteChannel|newDirectoryStream)|FileChannel\s*\.\s*open|` +
    String.raw`(?:java\.sql\.)?DriverManager\s*\.\s*getConnection)\s*\(`,
  'g',
);
const OPENING_MEMBER =
  /\??\.\s*(?:openStream|getResourceAsStream|openInputStream|openOutputStream)\s*\(/g;
const DATA_SOURCE_CONNECTION = /\??\.\s*(?:getConnection\s*\(\s*\)|connection\b(?!\s*[(=]))/g;
const FILE_MEMBER =
  /\??\.\s*(?:inputStream|outputStream|bufferedReader|bufferedWriter|reader|writer|printWriter)\s*\(/g;
const RESOURCE_MEMBER =
  /\??\.\s*(?:get(?:Input|Output)Stream\s*\(|(?:input|output)Stream\b(?!\s*[(=]))/g;

const FILE_CALLS = new Set([
  'File',
  'Path',
  'toFile',
  'toPath',
  'resolve',
  'resolveSibling',
  'createTempFile',
]);
const RESOURCE_CALLS = new Set([
  'ClassPathResource',
  'FileSystemResource',
  'UrlResource',
  'getResource',
]);
const DECLARED_TYPE = new RegExp(
  String.raw`(?<![\w.])([a-z_]\w*)\s*:\s*(?:[\w.]+\.)?(File|Path|Resource|ClassPathResource|FileSystemResource|` +
    String.raw`UrlResource|InputStreamSource|WritableResource|MultipartFile)\b(?!\s*[<.(])`,
  'g',
);
const DECLARED_VALUE = new RegExp(
  String.raw`\b(?:val|var)\s+([a-z_]\w*)\s*=\s*(?:[\w.]+\.)?` +
    String.raw`(File|Path|Paths\s*\.\s*get|Path\s*\.\s*of|ClassPathResource|FileSystemResource|UrlResource)\s*\(`,
  'g',
);
const FILE_TYPES = new Set(['File', 'Path']);
const ANY_DECLARATION = /(?<![\w.])([a-z_]\w*)\s*:\s*(?:[\w.]+\.)?([A-Z]\w*)/g;
const ANY_VALUE = /\b(?:val|var)\s+([a-z_]\w*)\s*=\s*(?:[\w.]+\.)?([A-Za-z_]\w*)/g;

function openingBefore(code, close) {
  const marks = [...code.slice(0, close + 1).matchAll(/[()]/g)].toReversed();
  let depth = 0;
  for (const { index, 0: mark } of marks) {
    depth += mark === ')' ? 1 : -1;
    if (depth === 0) {
      return index;
    }
  }
  return -1;
}

function trimmedEnd(code, end) {
  return code.slice(0, Math.max(0, end)).trimEnd().length;
}

export function segmentBefore(code, end) {
  let at = trimmedEnd(code, end);
  const call = code[at - 1] === ')';
  if (call) {
    at = trimmedEnd(code, openingBefore(code, at - 1));
  }
  const name = NAME_BEFORE.exec(code.slice(Math.max(0, at - LOOKBEHIND), at))?.[1];
  if (name === undefined) {
    return undefined;
  }
  const start = at - name.length;
  const qualifier = QUALIFIER_BEFORE.exec(code.slice(Math.max(0, start - LOOKBEHIND), start))?.[1];
  return { name, call, start, qualifier };
}

function previousSegment(code, start) {
  const dot = CALL_BEFORE.exec(code.slice(Math.max(0, start - LOOKBEHIND), start));
  return dot === null || dot[0] === '' ? undefined : segmentBefore(code, start - dot[0].length);
}

export function chainStart(code, start) {
  const pending = [start];
  for (const at of pending) {
    const segment = previousSegment(code, at);
    if (segment !== undefined) {
      pending.push(segment.start);
    }
  }
  return pending.at(-1);
}

function declaredKinds(code) {
  const kinds = new Map();
  for (const [, name, type] of code.matchAll(DECLARED_TYPE)) {
    kinds.set(name, FILE_TYPES.has(type) ? 'file' : 'resource');
  }
  for (const [, name, value] of code.matchAll(DECLARED_VALUE)) {
    kinds.set(name, /^(?:File|Path)/.test(value) ? 'file' : 'resource');
  }
  const typed = new Set(
    [...code.matchAll(DECLARED_TYPE), ...code.matchAll(DECLARED_VALUE)].map((m) => m.index),
  );
  const others = [...code.matchAll(ANY_DECLARATION), ...code.matchAll(ANY_VALUE)].filter(
    (match) => !typed.has(match.index),
  );
  for (const [, name] of others) {
    kinds.delete(name);
  }
  return kinds;
}

function receiverKind(code, dot, kinds) {
  const segment = segmentBefore(code, dot);
  if (segment === undefined) {
    return undefined;
  }
  const { name, call, qualifier } = segment;
  if (call) {
    if (
      FILE_CALLS.has(name) ||
      (name === 'of' && qualifier === 'Path') ||
      (name === 'get' && qualifier === 'Paths')
    ) {
      return 'file';
    }
    return RESOURCE_CALLS.has(name) ? 'resource' : undefined;
  }
  return qualifier === undefined || qualifier === 'this' ? kinds.get(name) : undefined;
}

function callEnd(code, match) {
  const open = match.index + match[0].length - 1;
  return code[open] === '(' ? closingIndex(code, open) + 1 : match.index + match[0].length;
}

function constructors(code) {
  return [...code.matchAll(OPENING_CONSTRUCTOR)].flatMap((match) => {
    const before = code.slice(Math.max(0, match.index - LOOKBEHIND), match.index);
    const end = callEnd(code, match);
    const empty = code.slice(match.index + match[0].length, end - 1).trim() === '';
    if (
      /(?:\b(?:fun|class|constructor)\s+|:\s*)$/.test(before) ||
      (NEEDS_ARGUMENTS.has(match[1]) && empty)
    ) {
      return [];
    }
    return [{ start: match.index, end }];
  });
}

function members(code, pattern, accepts) {
  return [...code.matchAll(pattern)].flatMap((match) => {
    const segment = segmentBefore(code, match.index);
    if (segment === undefined || !accepts(segment, match)) {
      return [];
    }
    return [{ start: chainStart(code, segment.start), end: callEnd(code, match) }];
  });
}

export function openedCloseables(code) {
  const kinds = declaredKinds(code);
  return [
    ...constructors(code),
    ...[...code.matchAll(OPENING_STATIC)].map((match) => ({
      start: match.index,
      end: callEnd(code, match),
    })),
    ...members(code, OPENING_MEMBER, () => true),
    ...members(
      code,
      DATA_SOURCE_CONNECTION,
      ({ name, call }) => !call && /datasource$/i.test(name),
    ),
    ...members(
      code,
      FILE_MEMBER,
      (_segment, match) => receiverKind(code, match.index, kinds) === 'file',
    ),
    ...members(
      code,
      RESOURCE_MEMBER,
      (_segment, match) => receiverKind(code, match.index, kinds) === 'resource',
    ),
  ].toSorted((left, right) => left.start - right.start);
}
