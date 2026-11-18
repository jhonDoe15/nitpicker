import {
  lineHunks as untypedLineHunks,
  linesOf as untypedLinesOf,
} from '../../../../../core/fix/common/rewrite/line-hunks.mjs';
import type { FixFile } from '../../../../../core/fix/typed/fix-types.mts';
import type { Touched } from '../patch/select-hunks.mts';

type Sources = ReadonlyMap<string, string>;
type TouchedFiles = {
  readonly files: readonly FixFile[];
  readonly baseSources: Sources;
  readonly live: Sources;
  readonly allFiles: boolean;
};

const linesOf: (text: string) => string[] = untypedLinesOf;
const lineHunks: (
  a: readonly string[],
  b: readonly string[],
) => readonly { readonly bStart: number; readonly bEnd: number }[] = untypedLineHunks;

export function touchedLinesOf(base: string, live: string): Set<number> {
  return new Set(
    lineHunks(linesOf(base), linesOf(live)).flatMap(({ bStart, bEnd }) =>
      Array.from({ length: Math.max(0, bEnd - bStart) }, (_, offset) => bStart + offset + 1),
    ),
  );
}

export function touchedByFile({
  files,
  baseSources,
  live,
  allFiles,
}: TouchedFiles): Map<string, Touched> {
  return new Map(
    files.map(({ path: name }): [string, Touched] => {
      const base = baseSources.get(name);
      return [
        name,
        allFiles || base === undefined ? 'all' : touchedLinesOf(base, live.get(name) ?? base),
      ];
    }),
  );
}
