import { globMatcher } from '../../../../shared/paths/glob.mjs';

const SOURCE_EXTENSION = /\.(?:java|kt|class)$/u;
const TEST_CLASS = /^(?:Test\w*|\w*(?:Test|Tests|TestCase|IT|ITCase|Spec))$/u;
export const SUREFIRE_CLASS = /^(?:Test\w*|\w*(?:Test|Tests|TestCase))$/u;
const INTEGRATION_TEST = /^(?:IT\w*|\w*(?:IT|ITCase))$/u;

function withoutExtension(pattern) {
  return pattern.replace(SOURCE_EXTENSION, '');
}

function relativeIn(file, roots) {
  const root = roots.find((candidate) => file.startsWith(`${candidate}/`));
  return root === undefined ? undefined : file.slice(root.length + 1);
}

function classPathMatches(relative, pattern) {
  const stem = withoutExtension(relative);
  const trimmed = withoutExtension(pattern);
  const candidates = [
    pattern,
    trimmed,
    ...(pattern.includes('/') ? [] : [trimmed.replaceAll('.', '/')]),
  ];
  return candidates.some((candidate) => {
    const matcher = globMatcher(candidate);
    return matcher.test(stem) || matcher.test(relative);
  });
}

function wildcard(pattern) {
  const source = pattern
    .split('*')
    .map((part) => part.replaceAll(/[$()+.?[\\\]^{|}]/gu, String.raw`\$&`))
    .join('.*');
  return new RegExp(`^${source}$`, 'u');
}

function testNameMatches(relative, pattern) {
  const name = withoutExtension(relative).replaceAll('/', '.');
  return wildcard(pattern).test(name) || pattern.startsWith(`${name}.`);
}

function testIncludeMatches(relative, pattern) {
  const [name] = pattern.split('#');
  return (
    classPathMatches(relative, name) ||
    classPathMatches(relative, `**/${name}`) ||
    testNameMatches(relative, name)
  );
}

function stemOf(file) {
  return withoutExtension(file.split('/').at(-1) ?? '');
}

const TEST_SET = /test/iu;

function testRootsOf(entries) {
  return entries.filter(({ set }) => TEST_SET.test(set)).flatMap(({ roots }) => roots);
}

function mainRootsOf(entries) {
  return entries.filter(({ set }) => !TEST_SET.test(set)).flatMap(({ roots }) => roots);
}

function matchesIn(among, matches) {
  return (file, pattern) => {
    const name = relativeIn(file, among);
    return name !== undefined && matches(name, pattern);
  };
}

export function excludeCovers(kind, entries) {
  const tests = testRootsOf(entries);
  const matchers = {
    source: matchesIn(mainRootsOf(entries), classPathMatches),
    test: matchesIn(tests, classPathMatches),
    integration: matchesIn(tests, (name, pattern) => {
      return INTEGRATION_TEST.test(stemOf(name)) && classPathMatches(name, pattern);
    }),
    integrationTag: matchesIn(tests, (name) => INTEGRATION_TEST.test(stemOf(name))),
    name: matchesIn(tests, testNameMatches),
    tag: matchesIn(tests, () => true),
  };
  return matchers[kind];
}

const SOURCE_INCLUDES = new Set(['source', 'testSource']);

export function includeScope(kind, entries, testClass = TEST_CLASS) {
  const roots = kind === 'source' ? mainRootsOf(entries) : testRootsOf(entries);
  const inRoots = (file) => relativeIn(file, roots) !== undefined;
  const admits = {
    source: matchesIn(roots, classPathMatches),
    testSource: matchesIn(roots, classPathMatches),
    test: matchesIn(roots, classPathMatches),
    name: matchesIn(roots, testIncludeMatches),
    tag: () => false,
  };
  return {
    inScope: SOURCE_INCLUDES.has(kind)
      ? inRoots
      : (file) => inRoots(file) && testClass.test(stemOf(file)),
    admits: admits[kind],
  };
}
