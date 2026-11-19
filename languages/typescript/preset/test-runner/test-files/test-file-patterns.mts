import path from 'node:path';
import { createRequire } from 'node:module';
import type picomatch from 'picomatch';
import { isInsideRoot, underRoot } from '../../layout/source-root/root-paths.mts';
import type { LayoutTestFiles } from '../../layout/layout-types.mts';

type Picomatch = typeof picomatch;
type FileMatcher = (file: string) => boolean;
type PartialTestFiles = Partial<LayoutTestFiles>;
type PatternMatchers = { readonly globs: FileMatcher; readonly regexes: readonly RegExp[] };
type RunnerPathsLayout = {
  readonly testFiles: LayoutTestFiles;
  readonly testGlobs: readonly string[];
  readonly runnableTestGlobs: readonly string[];
  projectCodeFiles(projectRoot: string): readonly string[];
  isRunnableTestFile(file: string): boolean;
};

const CODE_EXTENSIONS = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const NODE_EXTENSIONS = '{cjs,mjs,js,cts,mts,ts}';
const GLOB_SPECIAL = /[!()*+?@[\\\]{}]/gu;

export const VITEST_TEST_FILES = [`**/*.{test,spec}.${CODE_EXTENSIONS}`];

export const NODE_DEFAULT_PATTERNS = [
  `**/*.test.${NODE_EXTENSIONS}`,
  `**/*-test.${NODE_EXTENSIONS}`,
  `**/*_test.${NODE_EXTENSIONS}`,
  `**/test-*.${NODE_EXTENSIONS}`,
  `**/test.${NODE_EXTENSIONS}`,
  `**/test/**/*.${NODE_EXTENSIONS}`,
];

const JEST_DEFAULT_TEST_MATCH = [
  '**/__tests__/**/*.?([mc])[jt]s?(x)',
  '**/?(*.)+(spec|test).?([mc])[jt]s?(x)',
];

export const MOCHA_DEFAULT_SPEC = 'test';
export const MOCHA_DEFAULT_EXTENSIONS = ['js', 'cjs', 'mjs'];

export function normalizedGlob(glob: string): string {
  return glob.replaceAll('\\', '/').replace(/^(?:\.\/)+/u, '');
}

export function testFilePatterns({
  include = [],
  exclude = [],
  includeRegexes = [],
  excludeRegexes = [],
}: PartialTestFiles): LayoutTestFiles {
  return {
    include: [...new Set(include.map(normalizedGlob))],
    exclude: [...new Set(exclude.map(normalizedGlob))],
    includeRegexes: [...new Set(includeRegexes)],
    excludeRegexes: [...new Set(excludeRegexes)],
  };
}

const DEFAULTS: Readonly<Record<string, LayoutTestFiles> & { vitest: LayoutTestFiles }> = {
  vitest: testFilePatterns({ include: VITEST_TEST_FILES }),
  jest: testFilePatterns({ include: JEST_DEFAULT_TEST_MATCH, excludeRegexes: ['/node_modules/'] }),
  node: testFilePatterns({ include: NODE_DEFAULT_PATTERNS }),
  mocha: testFilePatterns({
    include: [`${MOCHA_DEFAULT_SPEC}/*.{${MOCHA_DEFAULT_EXTENSIONS.join(',')}}`],
  }),
};

export function defaultTestFiles(runner: string | undefined): LayoutTestFiles {
  return (runner === undefined ? undefined : DEFAULTS[runner]) ?? DEFAULTS.vitest;
}

export function policyTestFiles(
  tests: {
    readonly testFiles?: LayoutTestFiles | undefined;
    readonly runner?: string | undefined;
    readonly detectedRunner?: string | undefined;
  } = {},
): LayoutTestFiles {
  return tests.testFiles ?? defaultTestFiles(tests.runner ?? tests.detectedRunner);
}

export function mergedTestFiles(patterns: readonly LayoutTestFiles[]): LayoutTestFiles {
  return testFilePatterns({
    include: patterns.flatMap(({ include }) => include),
    exclude: patterns.flatMap(({ exclude }) => exclude),
    includeRegexes: patterns.flatMap(({ includeRegexes }) => includeRegexes),
    excludeRegexes: patterns.flatMap(({ excludeRegexes }) => excludeRegexes),
  });
}

export function escapedGlob(file: string): string {
  return file.replaceAll(GLOB_SPECIAL, String.raw`\$&`);
}

function compiled(source: string): RegExp {
  try {
    return new RegExp(source, 'u');
  } catch (error) {
    if (error instanceof SyntaxError) {
      return new RegExp(source);
    }
    throw error;
  }
}

function isPicomatch(value: unknown): value is Picomatch {
  return typeof value === 'function';
}

function loadPicomatch(): Picomatch {
  const loaded: unknown = createRequire(import.meta.url)('picomatch');
  if (!isPicomatch(loaded)) {
    throw new TypeError('picomatch did not load as a function');
  }
  return loaded;
}

function globMatcher(globs: readonly string[]): FileMatcher {
  if (globs.length === 0) {
    return () => false;
  }
  let matcher: FileMatcher | undefined;
  return (file) => {
    matcher ??= loadPicomatch()([...globs], { dot: true });
    return matcher(file);
  };
}

function matchesAny(file: string, { globs, regexes }: PatternMatchers): boolean {
  return globs(file) || regexes.some((regex) => regex.test(`/${file}`));
}

export function testFileMatcher(patterns: LayoutTestFiles): FileMatcher {
  const included = {
    globs: globMatcher(patterns.include),
    regexes: patterns.includeRegexes.map(compiled),
  };
  const excluded = {
    globs: globMatcher(patterns.exclude),
    regexes: patterns.excludeRegexes.map(compiled),
  };
  const verdicts = new Map<string, boolean>();
  return (file) => {
    const normalized = normalizedGlob(file);
    const known = verdicts.get(normalized);
    if (known !== undefined) {
      return known;
    }
    const verdict = matchesAny(normalized, included) && !matchesAny(normalized, excluded);
    verdicts.set(normalized, verdict);
    return verdict;
  };
}

function scopedGlob(root: string, glob: string): string[] {
  const [segment, ...after] = glob.slice('**/'.length).split('/');
  const nested = after.length > 0 && path.posix.basename(root) === segment;
  return [underRoot(root, glob), ...(nested ? [underRoot(root, after.join('/'))] : [])];
}

export function rootScopedGlobs(roots: readonly string[], include: readonly string[]): string[] {
  const scoped = include.flatMap((glob) =>
    glob.startsWith('**/') ? roots.flatMap((root) => scopedGlob(root, glob)) : [glob],
  );
  return [...new Set(scoped)];
}

export function sourceRootGlobs(
  sourceRoots: readonly string[],
  patterns: LayoutTestFiles,
): string[] {
  const extra = patterns.include.filter((glob) => !VITEST_TEST_FILES.includes(glob));
  return rootScopedGlobs(sourceRoots, extra).filter((glob) =>
    sourceRoots.some((root) => isInsideRoot(glob, root)),
  );
}

export function withRunnerTestPaths<Layout extends RunnerPathsLayout>(
  layout: Layout,
  projectRoot: string,
): Layout {
  if (layout.testFiles.includeRegexes.length === 0) {
    return layout;
  }
  const paths = layout
    .projectCodeFiles(projectRoot)
    .filter((file) => layout.isRunnableTestFile(file))
    .map(escapedGlob);
  return {
    ...layout,
    testGlobs: [...layout.testGlobs, ...paths],
    runnableTestGlobs: [...layout.runnableTestGlobs, ...paths],
  };
}
