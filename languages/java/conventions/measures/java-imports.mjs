const IMPORT = /^import\s+(static\s+)?[\w.$]+?(\.\*)?\s*;/gm;
const TEST_SET_NAMES = new Set(['test', 'tests', 'testFixtures']);
const TEST_SET_SUFFIXES = ['Test', 'Tests'];

export const TEST_SOURCE_GLOB = `**/src/{${[
  ...TEST_SET_NAMES,
  ...TEST_SET_SUFFIXES.map((suffix) => `*${suffix}`),
].join(',')}}/**/`;

function isTestSet(segment = '') {
  return (
    TEST_SET_NAMES.has(segment) ||
    TEST_SET_SUFFIXES.some((suffix) => segment.length > suffix.length && segment.endsWith(suffix))
  );
}

export function isTestSource(file) {
  const segments = file.split('/');
  return segments.some((segment, index) => segment === 'src' && isTestSet(segments[index + 1]));
}

function importsOf(text) {
  return [...text.matchAll(IMPORT)].map(([, isStatic, star]) => ({
    isStatic: isStatic !== undefined,
    star: star !== undefined,
  }));
}

export function wildcardImports(text, file = '') {
  const imports = importsOf(text);
  if (imports.length === 0) {
    return undefined;
  }
  const inTests = isTestSource(file);
  return imports.some(({ isStatic, star }) => star && !(isStatic && inTests))
    ? 'wildcard'
    : 'explicit';
}

export function testStaticImports(text) {
  const statics = importsOf(text).filter(({ isStatic }) => isStatic);
  if (statics.length === 0) {
    return undefined;
  }
  return statics.some(({ star }) => star) ? 'wildcard' : 'explicit';
}
