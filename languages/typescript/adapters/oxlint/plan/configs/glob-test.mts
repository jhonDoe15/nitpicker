import { createRequire } from 'node:module';
import { fieldOf } from '../../../../../../shared/values/readers.mts';

export type GlobPath = { readonly text: string; readonly parts: readonly string[] };
export type GlobTest = (path: GlobPath) => boolean;
type GlobTests = { readonly hit: GlobTest; readonly flipped: GlobTest };

type Minimatch = {
  readonly comment: boolean;
  readonly empty: boolean;
  readonly negate: boolean;
  readonly isWindows: boolean;
  readonly set: readonly (readonly unknown[])[];
  matchOne: (file: readonly string[], pattern: readonly unknown[], partial: boolean) => boolean;
  slashSplit: (path: string) => string[];
};
type MinimatchClass = new (pattern: string, options: object) => Minimatch;

const MINIMATCH_OPTIONS = { dot: true };

const eslintRequire = createRequire(createRequire(import.meta.url).resolve('eslint'));
const configArrayRequire = createRequire(eslintRequire.resolve('@eslint/config-array'));
const minimatchClass: unknown = fieldOf(configArrayRequire('minimatch'), 'Minimatch');

function isMinimatchClass(value: unknown): value is MinimatchClass {
  return typeof value === 'function';
}

function minimatchOf(pattern: string): Minimatch {
  if (!isMinimatchClass(minimatchClass)) {
    throw new TypeError('minimatch is not available');
  }
  return new minimatchClass(pattern, MINIMATCH_OPTIONS);
}

const splitter = minimatchOf('*');

export function globPath(text: string): GlobPath {
  return {
    text,
    parts: splitter.slashSplit(splitter.isWindows ? text.split('\\').join('/') : text),
  };
}

function literalHead(pattern: readonly unknown[]): readonly string[] {
  const end = pattern.findIndex((part) => typeof part !== 'string');
  return pattern.slice(0, end === -1 ? pattern.length : end).map(String);
}

function startsWith(parts: readonly string[], head: readonly string[]) {
  return head.every((part, index) => parts[index] === part);
}

export function globTests(pattern: string): GlobTests {
  const matcher = minimatchOf(pattern);
  const sets = matcher.set.map((set) => ({ set, head: literalHead(set) }));
  function matched({ parts }: GlobPath) {
    return sets.some(
      ({ set, head }) => startsWith(parts, head) && matcher.matchOne(parts, set, false),
    );
  }
  if (matcher.comment) {
    return { hit: () => false, flipped: () => false };
  }
  if (matcher.empty) {
    return { hit: ({ text }) => text === '', flipped: ({ text }) => text === '' };
  }
  return {
    hit: (path) => (matched(path) ? !matcher.negate : matcher.negate),
    flipped: matched,
  };
}
