const SUN_API_CLASS = /^\[SunApi\] class is an internal JDK API\b/u;
const SUN_API_TYPE = /^\[SunApi\] ([\w.$]+) is an internal JDK API\b/u;

function typeEnd(diagnostic) {
  const name = SUN_API_TYPE.exec(diagnostic.message)?.[1];
  return name === undefined || name === 'class'
    ? undefined
    : JSON.stringify([
        diagnostic.file,
        diagnostic.line,
        diagnostic.column + name.split('.').at(-1).length,
      ]);
}

export function withoutClassLiteralRepeats(diagnostics) {
  const ends = new Set(diagnostics.flatMap((diagnostic) => typeEnd(diagnostic) ?? []));
  return diagnostics.filter(
    (diagnostic) =>
      typeof diagnostic.message !== 'string' ||
      !SUN_API_CLASS.test(diagnostic.message) ||
      !ends.has(JSON.stringify([diagnostic.file, diagnostic.line, diagnostic.column])),
  );
}
