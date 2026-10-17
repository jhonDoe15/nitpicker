import { globToRegExp } from '../../../../shared/glob.mjs';

const SOURCE_EXTENSION = /\.(?:java|kt|class)$/u;

export function withoutExtension(pattern) {
  return pattern.replace(SOURCE_EXTENSION, '');
}

export function relativeIn(file, roots) {
  const root = roots.find((candidate) => file.startsWith(`${candidate}/`));
  return root === undefined ? undefined : file.slice(root.length + 1);
}

export function classPathMatches(relative, pattern) {
  const stem = withoutExtension(relative);
  const trimmed = withoutExtension(pattern);
  const candidates = [
    pattern,
    trimmed,
    ...(pattern.includes('/') ? [] : [trimmed.replaceAll('.', '/')]),
  ];
  return candidates.some((candidate) => {
    const matcher = globToRegExp(candidate);
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

export function testNameMatches(relative, pattern) {
  const name = withoutExtension(relative).replaceAll('/', '.');
  return wildcard(pattern).test(name) || pattern.startsWith(`${name}.`);
}

function testRootsOf(entries) {
  return entries.filter(({ set }) => /test/iu.test(set)).flatMap(({ roots }) => roots);
}

export function excludeCovers(kind, entries) {
  const roots = entries.flatMap((entry) => entry.roots);
  const tests = testRootsOf(entries);
  const matchesIn = (among, matches) => (file, pattern) => {
    const name = relativeIn(file, among);
    return name !== undefined && matches(name, pattern);
  };
  const matchers = {
    source: matchesIn(roots, classPathMatches),
    test: matchesIn(tests, classPathMatches),
    name: matchesIn(tests, testNameMatches),
    tag: matchesIn(tests, () => true),
  };
  return matchers[kind];
}
