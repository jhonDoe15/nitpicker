export function isChangedLine(changed, line) {
  return (
    changed !== undefined &&
    (changed.added || changed.ranges.some(([start, end]) => start <= line && line <= end))
  );
}

export function canMapLines(changed) {
  return changed === undefined || (changed.added !== true && Array.isArray(changed.hunks));
}

export function baseLineOf(changed, line) {
  if (isChangedLine(changed, line) || !canMapLines(changed)) {
    return undefined;
  }
  return (changed?.hunks ?? [])
    .filter((hunk) => hunk.newStart + Math.max(hunk.newCount, 1) - 1 < line)
    .reduce((mapped, hunk) => mapped + hunk.oldCount - hunk.newCount, line);
}
