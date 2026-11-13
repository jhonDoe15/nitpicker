import { changedLines } from '../patch/hunk-edits.mjs';

function distance(hunk, line) {
  return Math.min(...changedLines(hunk).map((changed) => Math.abs(changed - line)));
}

export function labelOf(hunk, diagnostics, checks) {
  const wanted = new Set(checks);
  const nearby = diagnostics
    .filter(({ check }) => wanted.has(check))
    .map((diagnostic) => ({ ...diagnostic, gap: distance(hunk, diagnostic.line) }))
    .toSorted((left, right) => left.gap - right.gap);
  return nearby[0]?.check ?? (checks.length === 1 ? checks[0] : undefined);
}

export function labelHunks(hunks, diagnostics, checks) {
  return hunks.flatMap((hunk) => {
    const label = labelOf(hunk, diagnostics, checks);
    return label === undefined ? [] : [{ label, hunk }];
  });
}
