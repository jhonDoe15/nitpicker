export function namedFunctions(coverage, file) {
  return Object.values(coverage.fnMap ?? {})
    .filter(({ name }) => typeof name === 'string' && !name.startsWith('(anonymous'))
    .map(({ name, loc }) => ({ file, name, start: loc?.start?.line, end: loc?.end?.line }));
}
