import { changedLines } from '../patch/hunk-edits.mjs';

function distance(hunk, line) {
  return Math.min(...changedLines(hunk).map((changed) => Math.abs(changed - line)));
}

function nearestDiagnostic(hunk, diagnostics, checks) {
  const wanted = new Set(checks);
  return diagnostics
    .filter(({ check }) => wanted.has(check))
    .map((diagnostic) => ({ ...diagnostic, gap: distance(hunk, diagnostic.line) }))
    .reduce((best, next) => (best === undefined || next.gap < best.gap ? next : best), undefined);
}

export function labelOf(hunk, diagnostics, checks) {
  return (
    nearestDiagnostic(hunk, diagnostics, checks)?.check ??
    (checks.length === 1 ? checks[0] : undefined)
  );
}

export function labelHunks(hunks, diagnostics, checks) {
  return hunks.flatMap((hunk) => {
    const nearest = nearestDiagnostic(hunk, diagnostics, checks);
    const label = nearest?.check ?? (checks.length === 1 ? checks[0] : undefined);
    if (label === undefined) {
      return [];
    }
    return [nearest === undefined ? { label, hunk } : { label, hunk, line: nearest.line }];
  });
}
