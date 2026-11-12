import { normalizeGitPath } from '../../git/normalize.mjs';
import { lineMapOf } from '../../git/unchanged-lines.mjs';

function linesOf({ startLine, endLine }) {
  return Array.from({ length: endLine - startLine + 1 }, (_, offset) => startLine + offset);
}

function baseSpanFor(headSpan, baseSpans, renames) {
  const headPath = normalizeGitPath(headSpan.path);
  return baseSpans?.find((span) => {
    const basePath = normalizeGitPath(span.path);
    return (renames.get(basePath) ?? basePath) === headPath;
  });
}

function isChangedLine(changed, line) {
  return (
    changed !== undefined &&
    (changed.added || changed.ranges.some(([start, end]) => start <= line && line <= end))
  );
}

function canMapLines(changed) {
  return changed === undefined || (changed.added !== true && Array.isArray(changed.hunks));
}

function keptLines(headSpan, baseSpan, changed) {
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

export function keepsBaseSpans(headFinding, baseFinding, { touchedCode, renames }) {
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
