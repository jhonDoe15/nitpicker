import { createRequire } from 'node:module';
import { fieldOf } from '../../../../../../shared/values/readers.mts';

export type GlobPath = { readonly text: string };
export type GlobTest = (path: GlobPath) => boolean;
type GlobTests = { readonly hit: GlobTest; readonly flipped: GlobTest };

type Minimatch = { match: (path: string) => boolean };
type MinimatchClass = new (pattern: string, options: object) => Minimatch;

const MINIMATCH_OPTIONS = { dot: true };
const FLIPPED_OPTIONS = { ...MINIMATCH_OPTIONS, flipNegate: true };

const eslintRequire = createRequire(createRequire(import.meta.url).resolve('eslint'));
const configArrayRequire = createRequire(eslintRequire.resolve('@eslint/config-array'));
const minimatchClass: unknown = fieldOf(configArrayRequire('minimatch'), 'Minimatch');

function isMinimatchClass(value: unknown): value is MinimatchClass {
  return typeof value === 'function';
}

function minimatchOf(pattern: string, options: object): Minimatch {
  if (!isMinimatchClass(minimatchClass)) {
    throw new TypeError('minimatch is not available');
  }
  return new minimatchClass(pattern, options);
}

export function globPath(text: string): GlobPath {
  return { text };
}

export function globTests(pattern: string): GlobTests {
  const matcher = minimatchOf(pattern, MINIMATCH_OPTIONS);
  const flipped = minimatchOf(pattern, FLIPPED_OPTIONS);
  return {
    hit: ({ text }) => matcher.match(text),
    flipped: ({ text }) => flipped.match(text),
  };
}
