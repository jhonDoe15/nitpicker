import { ESLint } from 'eslint';
import { fieldOf, listOf } from '../../../../../../shared/values/readers.mts';
import { globTests, type GlobPath, type GlobTest } from './glob-test.mts';

type Pattern = { readonly hit: GlobTest; readonly flipped: GlobTest; readonly negated: boolean };
type FilesElement = { readonly hit: GlobTest; readonly universal: boolean };
type Entry = {
  readonly files: readonly FilesElement[] | undefined;
  readonly specific: readonly FilesElement[];
  readonly universal: readonly FilesElement[];
  readonly ignores: readonly Pattern[] | undefined;
  readonly globalIgnores: readonly Pattern[] | undefined;
};
type Compiled<Value> = { readonly value: Value | undefined };

const META_FIELDS = new Set(['name', 'basePath']);
const UNIVERSAL = /^\*$|^!|\/\*{1,2}$/u;
const CURRENT_DIRECTORY = './';
const NEGATED_CURRENT_DIRECTORY = '!./';
const EXTERNAL = /^\.\.(?:\/|$)/u;

const defaultEntries: readonly unknown[] = listOf(ESLint.defaultConfig);

function normalizedPattern(pattern: string) {
  if (pattern.startsWith(CURRENT_DIRECTORY)) {
    return pattern.slice(CURRENT_DIRECTORY.length);
  }
  return pattern.startsWith(NEGATED_CURRENT_DIRECTORY)
    ? `!${pattern.slice(NEGATED_CURRENT_DIRECTORY.length)}`
    : pattern;
}

function compiledPattern(pattern: unknown, cache: Map<string, Pattern>): Pattern | undefined {
  if (typeof pattern !== 'string') {
    return undefined;
  }
  const known = cache.get(pattern);
  if (known !== undefined) {
    return known;
  }
  const normalized = normalizedPattern(pattern);
  const negated = normalized.startsWith('!');
  const compiled: Pattern = { negated, ...globTests(normalized) };
  cache.set(pattern, compiled);
  return compiled;
}

function allCompiled<Compiled>(
  sources: readonly unknown[],
  compile: (source: unknown) => Compiled | undefined,
): Compiled[] | undefined {
  const compiled = sources.map(compile);
  return compiled.every((item) => item !== undefined) ? compiled : undefined;
}

function compiledPatterns(patterns: readonly unknown[], cache: Map<string, Pattern>) {
  return allCompiled(patterns, (pattern) => compiledPattern(pattern, cache));
}

function filesElement(element: unknown, cache: Map<string, Pattern>): FilesElement | undefined {
  const sources = Array.isArray(element) ? listOf(element) : [element];
  const patterns = compiledPatterns(sources, cache);
  if (patterns === undefined) {
    return undefined;
  }
  return {
    hit: (relativePath: GlobPath) => patterns.every((pattern) => pattern.hit(relativePath)),
    universal: sources.every((source) => UNIVERSAL.test(normalizedPattern(String(source)))),
  };
}

function compiledFiles(files: unknown, cache: Map<string, Pattern>) {
  return allCompiled(listOf(files), (element) => filesElement(element, cache));
}

function isPlainEntry(entry: unknown): entry is object {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    !Array.isArray(entry) &&
    fieldOf(entry, 'basePath') === undefined
  );
}

function compiledField<Value>(
  value: unknown,
  compile: (value: unknown) => Value | undefined,
): Compiled<Value> | undefined {
  if (value === undefined) {
    return { value: undefined };
  }
  const compiled = compile(value);
  return compiled === undefined ? undefined : { value: compiled };
}

function hasOneField(entry: object): boolean {
  return Object.keys(entry).filter((key) => !META_FIELDS.has(key)).length === 1;
}

function compiledEntry(entry: unknown, cache: Map<string, Pattern>): Entry | undefined {
  if (!isPlainEntry(entry)) {
    return undefined;
  }
  const files = compiledField(fieldOf(entry, 'files'), (value) => compiledFiles(value, cache));
  const ignores = compiledField(fieldOf(entry, 'ignores'), (value) =>
    compiledPatterns(listOf(value), cache),
  );
  if (files === undefined || ignores === undefined) {
    return undefined;
  }
  const elements = files.value ?? [];
  return {
    files: files.value,
    specific: elements.filter((element) => !element.universal),
    universal: elements.filter((element) => element.universal),
    ignores: ignores.value,
    globalIgnores: hasOneField(entry) ? ignores.value : undefined,
  };
}

function ignored(ignores: readonly Pattern[], relativePath: GlobPath, start: boolean): boolean {
  return ignores.reduce((isIgnored, pattern) => {
    if (!isIgnored) {
      return !pattern.negated && pattern.hit(relativePath);
    }
    return pattern.negated ? !pattern.flipped(relativePath) : isIgnored;
  }, start);
}

function pathMatches(
  files: readonly FilesElement[],
  ignores: Entry['ignores'],
  relativePath: GlobPath,
): boolean {
  return (
    files.some((element) => element.hit(relativePath)) &&
    !ignored(ignores ?? [], relativePath, false)
  );
}

export { compiledEntry, defaultEntries, EXTERNAL, ignored, pathMatches };
export type { Entry, Pattern };
