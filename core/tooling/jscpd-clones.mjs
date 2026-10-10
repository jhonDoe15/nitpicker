export function jscpdClones(report, configuredPaths) {
  const prefix =
    Array.isArray(configuredPaths) && configuredPaths.length === 1
      ? configuredPaths[0].replace(/\/$/, '')
      : '';
  return (report.duplicates ?? []).map((duplicate) => ({
    first: {
      file: prefixedPath(prefix, duplicate.firstFile?.name),
      line: duplicate.firstFile?.start,
    },
    second: {
      file: prefixedPath(prefix, duplicate.secondFile?.name),
      line: duplicate.secondFile?.start,
    },
    fragment: duplicate.fragment,
    lines: duplicate.lines,
    tokens: duplicate.tokens,
  }));
}

function prefixedPath(prefix, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Duplicate report contains an invalid file name');
  }
  const normalizedValue = value.replaceAll('\\', '/').replace(/^\.\//, '');
  return prefix.length === 0 ||
    normalizedValue === prefix ||
    normalizedValue.startsWith(`${prefix}/`)
    ? normalizedValue
    : `${prefix}/${normalizedValue}`;
}
