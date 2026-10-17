import path from 'node:path';

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

export function normalizedGlob(glob) {
  return glob.replaceAll('\\', '/').replace(/^(?:\.\/)+/u, '');
}

export function testFilePatterns({
  include = [],
  exclude = [],
  includeRegexes = [],
  excludeRegexes = [],
}) {
  return {
    include: [...new Set(include.map(normalizedGlob))],
    exclude: [...new Set(exclude.map(normalizedGlob))],
    includeRegexes: [...new Set(includeRegexes)],
    excludeRegexes: [...new Set(excludeRegexes)],
  };
}

const DEFAULTS = {
  vitest: testFilePatterns({ include: VITEST_TEST_FILES }),
  jest: testFilePatterns({ include: JEST_DEFAULT_TEST_MATCH, excludeRegexes: ['/node_modules/'] }),
  node: testFilePatterns({ include: NODE_DEFAULT_PATTERNS }),
  mocha: testFilePatterns({
    include: [`${MOCHA_DEFAULT_SPEC}/*.{${MOCHA_DEFAULT_EXTENSIONS.join(',')}}`],
  }),
};

export function defaultTestFiles(runner) {
  return DEFAULTS[runner] ?? DEFAULTS.vitest;
}

export function policyTestFiles(tests = {}) {
  return tests.testFiles ?? defaultTestFiles(tests.runner ?? tests.detectedRunner);
}

export function mergedTestFiles(patterns) {
  return testFilePatterns({
    include: patterns.flatMap(({ include }) => include),
    exclude: patterns.flatMap(({ exclude }) => exclude),
    includeRegexes: patterns.flatMap(({ includeRegexes }) => includeRegexes),
    excludeRegexes: patterns.flatMap(({ excludeRegexes }) => excludeRegexes),
  });
}

export function escapedGlob(file) {
  return file.replaceAll(GLOB_SPECIAL, String.raw`\$&`);
}

function compiled(source) {
  try {
    return new RegExp(source, 'u');
  } catch (error) {
    if (error instanceof SyntaxError) {
      return new RegExp(source);
    }
    throw error;
  }
}

function matchesAny(file, { globs, regexes }) {
  return (
    globs.some((glob) => path.posix.matchesGlob(file, glob)) ||
    regexes.some((regex) => regex.test(`/${file}`))
  );
}

export function testFileMatcher(patterns) {
  const included = { globs: patterns.include, regexes: patterns.includeRegexes.map(compiled) };
  const excluded = { globs: patterns.exclude, regexes: patterns.excludeRegexes.map(compiled) };
  const verdicts = new Map();
  return (file) => {
    const normalized = normalizedGlob(file);
    if (!verdicts.has(normalized)) {
      verdicts.set(
        normalized,
        matchesAny(normalized, included) && !matchesAny(normalized, excluded),
      );
    }
    return verdicts.get(normalized);
  };
}

function scopedGlob(root, glob) {
  const [segment, ...after] = glob.slice('**/'.length).split('/');
  const nested = after.length > 0 && path.posix.basename(root) === segment;
  return [`${root}/${glob}`, ...(nested ? [`${root}/${after.join('/')}`] : [])];
}

export function rootScopedGlobs(roots, include) {
  const scoped = include.flatMap((glob) =>
    glob.startsWith('**/') ? roots.flatMap((root) => scopedGlob(root, glob)) : [glob],
  );
  return [...new Set(scoped)];
}

export function sourceRootGlobs(sourceRoots, patterns) {
  const extra = patterns.include.filter((glob) => !VITEST_TEST_FILES.includes(glob));
  return rootScopedGlobs(sourceRoots, extra).filter((glob) =>
    sourceRoots.some((root) => glob.startsWith(`${root}/`)),
  );
}
