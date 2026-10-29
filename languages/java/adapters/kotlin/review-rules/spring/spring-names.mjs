const QUALIFIED = /^[a-z_][\w]*(?:\.[\w]+)+$/u;
const DEFAULT_PACKAGES = [
  'kotlin',
  'kotlin.annotation',
  'kotlin.collections',
  'kotlin.comparisons',
  'kotlin.io',
  'kotlin.ranges',
  'kotlin.sequences',
  'kotlin.text',
  'kotlin.jvm',
  'java.lang',
];
const BUILTIN_TYPES = new Set([
  'Any',
  'Error',
  'Exception',
  'Throwable',
  'RuntimeException',
  'IllegalArgumentException',
  'IllegalStateException',
  'NullPointerException',
  'NumberFormatException',
  'IndexOutOfBoundsException',
  'ArrayIndexOutOfBoundsException',
  'StringIndexOutOfBoundsException',
  'ClassCastException',
  'ArithmeticException',
  'UnsupportedOperationException',
  'NoSuchElementException',
  'ConcurrentModificationException',
  'InterruptedException',
  'CloneNotSupportedException',
  'SecurityException',
  'AssertionError',
  'NotImplementedError',
  'UninitializedPropertyAccessException',
  'NoWhenBranchMatchedException',
  'ClassNotFoundException',
  'ReflectiveOperationException',
  'IllegalMonitorStateException',
  'NegativeArraySizeException',
  'ArrayStoreException',
  'OutOfMemoryError',
  'StackOverflowError',
  'String',
  'Int',
  'Long',
  'Boolean',
  'Double',
  'Float',
  'Short',
  'Byte',
  'Char',
  'Unit',
  'Nothing',
]);
const STRING_LITERAL = /^"((?:[^"\\$]|\\.|\$(?![{\w]))*)"$/su;
const ESCAPE = /\\(.)/gu;
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b' };

export function declaredNames(files) {
  return new Set(
    files.flatMap((file) =>
      file.classes.map((declared) => [file.package, declared.qualified].filter(Boolean).join('.')),
    ),
  );
}

function candidatesOf(name, { file, declared, explicit, stars }) {
  const [first, ...rest] = name.split('.');
  if (explicit.has(first)) {
    return [[explicit.get(first), ...rest].join('.')];
  }
  if (QUALIFIED.test(name)) {
    return [name];
  }
  const local = [file.package, name].filter(Boolean).join('.');
  if (declared.has(local)) {
    return [local];
  }
  const starred = stars.map((prefix) => `${prefix}.${name}`);
  const declaredStar = starred.filter((candidate) => declared.has(candidate));
  if (declaredStar.length > 0) {
    return declaredStar;
  }
  const defaults = DEFAULT_PACKAGES.map((prefix) => `${prefix}.${name}`);
  return BUILTIN_TYPES.has(name) ? defaults : [...starred, ...defaults];
}

export function nameResolver(file, declared) {
  const context = {
    file,
    declared,
    explicit: new Map(
      file.imports
        .filter(({ all }) => !all)
        .map(({ path, alias }) => [alias ?? path.split('.').at(-1), path]),
    ),
    stars: file.imports.filter(({ all }) => all).map(({ path }) => path),
  };
  const cache = new Map();
  return (name) => {
    if (!cache.has(name)) {
      cache.set(name, candidatesOf(name, context));
    }
    return cache.get(name);
  };
}

export function typeName(text) {
  return (text ?? '')
    .replaceAll(/\s+/gu, '')
    .replace(/^@/u, '')
    .replace(/[?!]+$/u, '')
    .replace(/<.*$/su, '');
}

const DEPTH_STEP = { '<': 1, '>': -1 };

export function simpleTypeName(text) {
  return typeName(text).split('.').at(-1);
}

export function typeArguments(text) {
  const compact = (text ?? '').replaceAll(/\s+/gu, '').replace(/\?$/u, '');
  const open = compact.indexOf('<');
  if (open < 0 || !compact.endsWith('>')) {
    return [];
  }
  const parts = [''];
  let depth = 0;
  for (const character of compact.slice(open + 1, -1)) {
    depth += DEPTH_STEP[character] ?? 0;
    if (character === ',' && depth === 0) {
      parts.push('');
    } else {
      parts[parts.length - 1] += character;
    }
  }
  return parts;
}

export function resolvesTo(resolve, text, fqns) {
  const name = typeName(text);
  return name !== '' && resolve(name).some((candidate) => fqns.has(candidate));
}

export function annotationIn(resolve, entries, fqns) {
  return (entries ?? []).find((entry) => resolvesTo(resolve, entry.type ?? entry.name, fqns));
}

export function argumentOf(entry, name, { positional = false } = {}) {
  const named = entry.arguments.find((argument) => argument.name === name);
  if (named !== undefined || !positional) {
    return named?.text;
  }
  return entry.arguments.find((argument) => argument.name === undefined)?.text;
}

export function isTrue(text) {
  return text === 'true' || text === '"true"';
}

export function stringValue(text) {
  const match = STRING_LITERAL.exec((text ?? '').trim());
  return match === null
    ? undefined
    : match[1].replaceAll(ESCAPE, (_, character) => ESCAPES[character] ?? character);
}

export function stringValues(text) {
  const values = [...(text ?? '').matchAll(/"(?:[^"\\]|\\.)*"/gsu)].map(([literal]) =>
    stringValue(literal),
  );
  return values.filter((value) => value !== undefined);
}
