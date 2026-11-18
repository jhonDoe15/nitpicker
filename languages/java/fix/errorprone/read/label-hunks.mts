import { changedLines } from '../patch/hunk-edits.mts';
import type { LabeledHunk } from '../patch/select-hunks.mts';
import type { Hunk } from '../patch/unified-diff.mts';
import { largest, smallest } from '../../../../../shared/lists/lists.mts';

export type Diagnostic = {
  readonly check: string;
  readonly line: number;
  readonly endLine?: number;
};
type Placed = Diagnostic & { readonly gap: number };
type Scope = {
  readonly diagnostics: readonly Diagnostic[];
  readonly checks: readonly string[];
  readonly spanChecks: ReadonlySet<string>;
};

function distance(hunk: Hunk, line: number): number {
  return smallest(changedLines(hunk).map((changed) => Math.abs(changed - line)));
}

function isSpan({ line, endLine }: Diagnostic): boolean {
  return endLine !== undefined && endLine > line;
}

function width({ line, endLine = line }: Diagnostic): number {
  return endLine - line;
}

function narrower(best: Diagnostic | undefined, next: Diagnostic, anchor: number): Diagnostic {
  if (best === undefined || width(next) < width(best)) {
    return next;
  }
  return width(next) === width(best) && next.line === anchor ? next : best;
}

function spanning(
  hunk: Hunk,
  diagnostics: readonly Diagnostic[],
  wanted: ReadonlySet<string>,
): Diagnostic | undefined {
  const lines = changedLines(hunk);
  const slack = hunk.lines.some(({ kind }) => kind === '-') ? 0 : 1;
  const anchor = largest(lines);
  return diagnostics
    .filter((diagnostic) => wanted.has(diagnostic.check) && isSpan(diagnostic))
    .filter(({ line, endLine = line }) =>
      lines.every((changed) => changed >= line - slack && changed <= endLine + slack),
    )
    .reduce<Diagnostic | undefined>((best, next) => narrower(best, next, anchor), undefined);
}

function ownLine(
  hunk: Hunk,
  diagnostics: readonly Diagnostic[],
  wanted: ReadonlySet<string>,
): Diagnostic | undefined {
  const lines = changedLines(hunk);
  if (!hunk.lines.some(({ kind }) => kind === '-')) {
    return undefined;
  }
  const asked = diagnostics.filter(({ check }) => wanted.has(check));
  const single = asked.filter(
    (diagnostic) => !isSpan(diagnostic) && lines.every((changed) => changed === diagnostic.line),
  );
  const starts = asked.some((diagnostic) => isSpan(diagnostic) && lines.includes(diagnostic.line));
  return single.length === 1 && !starts ? single[0] : undefined;
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

function spanFor(hunk: Hunk, scope: Scope, nearest: Placed | undefined): Diagnostic | undefined {
  const span = spanning(hunk, scope.diagnostics, scope.spanChecks);
  const onLine = nearest !== undefined && nearest.gap === 0 && !scope.spanChecks.has(nearest.check);
  return onLine ? undefined : span;
}

function labeled(hunk: Hunk, scope: Scope): LabeledHunk[] {
  const { diagnostics, checks } = scope;
  const own = ownLine(hunk, diagnostics, new Set(checks));
  if (own !== undefined) {
    return [{ label: own.check, hunk, line: own.line }];
  }
  const nearest = nearestDiagnostic(hunk, diagnostics, checks);
  const span = spanFor(hunk, scope, nearest);
  if (span !== undefined) {
    return [{ label: span.check, hunk, line: span.line, group: groupOf(span) }];
  }
  const label = nearest?.check ?? (checks.length === 1 ? checks[0] : undefined);
  if (label === undefined) {
    return [];
  }
  return [nearest === undefined ? { label, hunk } : { label, hunk, line: nearest.line }];
}

function groupOf({ check, line }: Diagnostic): string {
  return `${check}:${String(line)}`;
}

function straddled(hunk: Hunk, spans: readonly Diagnostic[]): string[] {
  const lines = changedLines(hunk);
  return spans
    .filter(({ line, endLine = line }) => {
      const inside = lines.filter((changed) => changed >= line && changed <= endLine);
      return inside.length > 0 && inside.length < lines.length;
    })
    .map(groupOf);
}

function mergeGroups(root: Map<string, string>, groups: readonly string[]): void {
  const [first] = groups;
  if (first === undefined) {
    return;
  }
  const target = root.get(first) ?? first;
  const replaced = new Set(groups.map((group) => root.get(group) ?? group));
  for (const [group, current] of root) {
    if (replaced.has(current)) {
      root.set(group, target);
    }
  }
  for (const group of groups) {
    root.set(group, target);
  }
}

function joinedGroups(straddles: readonly (readonly string[])[]): Map<string, string> {
  const root = new Map<string, string>();
  for (const groups of straddles) {
    mergeGroups(root, groups);
  }
  return root;
}

function joinStraddling(entries: readonly LabeledHunk[], scope: Scope): LabeledHunk[] {
  const spans = scope.diagnostics.filter(
    (diagnostic) => scope.spanChecks.has(diagnostic.check) && isSpan(diagnostic),
  );
  const straddles = entries.map((entry) =>
    entry.group === undefined ? straddled(entry.hunk, spans) : [],
  );
  const root = joinedGroups(straddles);
  return entries.map((entry, index) => {
    const first = entry.group ?? straddles[index]?.[0];
    return first === undefined ? entry : { ...entry, group: root.get(first) ?? first };
  });
}

export function labelHunks(
  hunks: readonly Hunk[],
  diagnostics: readonly Diagnostic[],
  {
    checks,
    spanChecks = new Set(),
  }: { checks: readonly string[]; spanChecks?: ReadonlySet<string> },
): LabeledHunk[] {
  const scope: Scope = {
    diagnostics,
    checks,
    spanChecks: new Set([...spanChecks].filter((check) => checks.includes(check))),
  };
  return joinStraddling(
    hunks.flatMap((hunk) => labeled(hunk, scope)),
    scope,
  );
}
