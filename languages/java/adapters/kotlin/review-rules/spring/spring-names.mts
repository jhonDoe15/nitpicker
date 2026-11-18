import { ancestorsOf } from '../kotlin-facts.mts';
import { SPRING_MANAGED_CLASSES } from './spring-types.mts';
import type { Annotation, Fqns, Import, Resolve, SourceFile } from './typed/spring-shapes.mts';

const QUALIFIED = /^[a-z_]\w*(?:\.\w+)+$/u;
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
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b' };

export function declaredNames(files: readonly NamedFile[]): Set<string> {
  return new Set(
    files.flatMap((file) =>
      file.classes.map((declared) => [file.package, declared.qualified].filter(Boolean).join('.')),
    ),
  );
}

type NamedFile = { package: string; classes: readonly { qualified: string }[] };
type ImportingFile = { package: string; imports: readonly Import[] };

type CandidateContext = {
  file: ImportingFile;
  declared: ReadonlySet<string>;
  explicit: Map<string | undefined, string>;
  stars: string[];
};

function candidatesOf(
  name: string,
  { file, declared, explicit, stars }: CandidateContext,
): string[] {
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

export function nameResolver(file: ImportingFile, declared: ReadonlySet<string>): Resolve {
  const context: CandidateContext = {
    file,
    declared,
    explicit: new Map(
      file.imports
        .filter(({ all }) => !all)
        .map(({ path, alias }) => [alias ?? path.split('.').at(-1), path]),
    ),
    stars: file.imports.filter(({ all }) => all).map(({ path }) => path),
  };
  const cache = new Map<string, string[]>();
  return (name) => {
    const known = cache.get(name);
    if (known !== undefined) {
      return known;
    }
    const found = candidatesOf(name, context);
    cache.set(name, found);
    return found;
  };
}

export function typeName(text: string | undefined): string {
  return (text ?? '')
    .replaceAll(/\s+/gu, '')
    .replace(/^@/u, '')
    .replace(/[?!]+$/u, '')
    .replace(/<.*$/su, '');
}

const DEPTH_STEP: Record<string, number> = { '<': 1, '>': -1 };

export function typeArguments(text: string | undefined): string[] {
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
      parts[parts.length - 1] = (parts.at(-1) ?? '') + character;
    }
  }
  return parts;
}

export function resolvesTo(resolve: Resolve, text: string | undefined, fqns: Fqns): boolean {
  const name = typeName(text);
  return name !== '' && resolve(name).some((candidate) => fqns.has(candidate));
}

export function annotationIn(
  resolve: Resolve,
  entries: readonly Annotation[] | undefined,
  fqns: Fqns,
): Annotation | undefined {
  return (entries ?? []).find((entry) => resolvesTo(resolve, entry.type ?? entry.name, fqns));
}

export function argumentOf(
  entry: Pick<Annotation, 'arguments'>,
  name: string,
  { positional }: { positional: boolean } = { positional: false },
): string | undefined {
  const named = entry.arguments.find((argument) => argument.name === name);
  if (named !== undefined || !positional) {
    return named?.text;
  }
  return entry.arguments.find((argument) => argument.name === undefined)?.text;
}

export function isTrue(text: string | undefined): boolean {
  return text === 'true' || text === '"true"';
}

export function stringValue(text: string | undefined): string | undefined {
  const match = STRING_LITERAL.exec((text ?? '').trim());
  return match === null
    ? undefined
    : (match[1] ?? '').replaceAll(
        ESCAPE,
        (_, character: string) => ESCAPES[character] ?? character,
      );
}

export function stringValues(text: string | undefined): string[] {
  const values = [...(text ?? '').matchAll(/"(?:[^"\\]|\\.)*"/gsu)].map(([literal]) =>
    stringValue(literal),
  );
  return values.filter((value) => value !== undefined);
}

export function springManagedOwner(
  file: SourceFile,
  declared: Set<string>,
): (owner: string) => boolean {
  const resolve = nameResolver(file, declared);
  const classes = new Map(file.classes.map((klass) => [klass.qualified, klass]));
  return (owner: string) =>
    ancestorsOf(owner).some(
      (qualified) =>
        annotationIn(resolve, classes.get(qualified)?.annotations, SPRING_MANAGED_CLASSES) !==
        undefined,
    );
}
