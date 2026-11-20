import { normalizeGitPath } from '../../git/normalize.mts';
import { lineMapOf } from '../../git/unchanged-lines.mts';
import type {
  LineSpan,
  RatchetedFinding,
  ChangedLines,
  TouchedEntry,
} from '../model/finding-types.mts';

type Changed = TouchedEntry | undefined;

function linesOf({ startLine, endLine }: LineSpan): number[] {
  return Array.from({ length: endLine - startLine + 1 }, (_, offset) => startLine + offset);
}

function baseSpanFor(
  headSpan: LineSpan,
  baseSpans: readonly LineSpan[] | undefined,
  renames: ReadonlyMap<string, string>,
): LineSpan | undefined {
  const headPath = normalizeGitPath(headSpan.path);
  return baseSpans?.find((span) => {
    const basePath = normalizeGitPath(span.path);
    return (renames.get(basePath) ?? basePath) === headPath;
  });
}

function isChangedLine(changed: Changed, line: number): boolean {
  return (
    changed !== undefined &&
    (changed.added || changed.ranges.some(([start, end]) => start <= line && line <= end))
  );
}

function canMapLines(changed: Changed): boolean {
  return changed === undefined || (!changed.added && Array.isArray(changed.hunks));
}

function keptLines(headSpan: LineSpan, baseSpan: LineSpan | undefined, changed: Changed): number[] {
  const lines = linesOf(headSpan);
  if (baseSpan === undefined || !canMapLines(changed)) {
    return lines.filter((line) => !isChangedLine(changed, line));
  }
  const lineMap = lineMapOf(changed);
  return lines.filter((line) => {
    const baseLine = isChangedLine(changed, line) ? undefined : lineMap.baseLineOf(line);
    return baseLine !== undefined && baseLine >= baseSpan.startLine && baseLine <= baseSpan.endLine;
  });
}

export function keepsBaseSpans(
  headFinding: RatchetedFinding,
  baseFinding: RatchetedFinding,
  {
    touchedCode,
    renames,
  }: {
    readonly touchedCode: ChangedLines | undefined;
    readonly renames: ReadonlyMap<string, string>;
  },
): boolean {
  const headSpans = headFinding.ratchet.mustKeepUnchangedLines;
  if (headSpans === undefined || touchedCode === undefined) {
    return true;
  }
  const baseSpans = baseFinding.ratchet.mustKeepUnchangedLines;
  return headSpans.every((headSpan) => {
    const baseSpan = baseSpanFor(headSpan, baseSpans, renames);
    if (baseSpans !== undefined && baseSpan === undefined) {
      return false;
    }
    const kept = keptLines(headSpan, baseSpan, touchedCode.changedLines.get(headSpan.path));
    return kept.length * 2 > headSpan.endLine - headSpan.startLine + 1;
  });
}
