const IMPORT = /^import\s+(static\s+)?[\w.]+?(\.\*)?\s*;/gm;
const TEST_SOURCE_SET = /(?:^|\/)src\/[^/]*[Tt]est[^/]*\//;

export function isTestSource(file) {
  return TEST_SOURCE_SET.test(file);
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
