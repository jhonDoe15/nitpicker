import { changedLines } from '../patch/hunk-edits.mts';
import type { LabeledHunk } from '../patch/select-hunks.mts';
import type { Hunk } from '../patch/unified-diff.mts';
import { smallest } from '../../../../../shared/lists/lists.mts';

export type Diagnostic = { readonly check: string; readonly line: number };
type Placed = Diagnostic & { readonly gap: number };

function distance(hunk: Hunk, line: number): number {
  return smallest(changedLines(hunk).map((changed) => Math.abs(changed - line)));
}

function nearestDiagnostic(
  hunk: Hunk,
  diagnostics: readonly Diagnostic[],
  checks: readonly string[],
): Placed | undefined {
  const wanted = new Set(checks);
  return diagnostics
    .filter(({ check }) => wanted.has(check))
    .map((diagnostic): Placed => ({ ...diagnostic, gap: distance(hunk, diagnostic.line) }))
    .reduce<Placed | undefined>(
      (best, next) => (best === undefined || next.gap < best.gap ? next : best),
      undefined,
    );
}

export function labelOf(
  hunk: Hunk,
  diagnostics: readonly Diagnostic[],
  checks: readonly string[],
): string | undefined {
  return (
    nearestDiagnostic(hunk, diagnostics, checks)?.check ??
    (checks.length === 1 ? checks[0] : undefined)
  );
}

export function labelHunks(
  hunks: readonly Hunk[],
  diagnostics: readonly Diagnostic[],
  checks: readonly string[],
): LabeledHunk[] {
  return hunks.flatMap((hunk): LabeledHunk[] => {
    const nearest = nearestDiagnostic(hunk, diagnostics, checks);
    const label = nearest?.check ?? (checks.length === 1 ? checks[0] : undefined);
    if (label === undefined) {
      return [];
    }
    return [nearest === undefined ? { label, hunk } : { label, hunk, line: nearest.line }];
  });
}
