import { lineHunks, linesOf } from '../../../../../core/fix/common/rewrite/line-hunks.mjs';

export function touchedLinesOf(base, live) {
  return new Set(
    lineHunks(linesOf(base), linesOf(live)).flatMap(({ bStart, bEnd }) =>
      Array.from({ length: Math.max(0, bEnd - bStart) }, (_, offset) => bStart + offset + 1),
    ),
  );
}

export function touchedByFile({ files, baseSources, live, allFiles }) {
  return new Map(
    files.map(({ path: name }) => {
      const base = baseSources.get(name);
      return [
        name,
        allFiles || base === undefined ? 'all' : touchedLinesOf(base, live.get(name) ?? base),
      ];
    }),
  );
}
