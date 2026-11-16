import { numberOr, textOf } from '../../../../shared/values/readers.mts';
import type { Diagnostic } from './diagnostic.mts';

const SUN_API_CLASS = /^\[SunApi\] class is an internal JDK API\b/u;
const SUN_API_TYPE = /^\[SunApi\] ([\w.$]+) is an internal JDK API\b/u;

function typeEnd(diagnostic: Diagnostic): string | undefined {
  const name = SUN_API_TYPE.exec(textOf(diagnostic.message))?.[1];
  return name === undefined || name === 'class'
    ? undefined
    : JSON.stringify([
        diagnostic.file,
        diagnostic.line,
        numberOr(diagnostic.column, Number.NaN) + textOf(name.split('.').at(-1)).length,
      ]);
}

export function withoutClassLiteralRepeats(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const ends = new Set(diagnostics.flatMap((diagnostic) => typeEnd(diagnostic) ?? []));
  return diagnostics.filter(
    (diagnostic) =>
      typeof diagnostic.message !== 'string' ||
      !SUN_API_CLASS.test(diagnostic.message) ||
      !ends.has(JSON.stringify([diagnostic.file, diagnostic.line, diagnostic.column])),
  );
}
