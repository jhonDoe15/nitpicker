import { fieldOf, numberOr, textsOf } from '../../shared/values/readers.mts';

export type Scope = { readonly paths: readonly string[] };

type Pathed = { readonly path?: unknown };

type OutcomeResult = {
  readonly newFindings: readonly Pathed[];
  readonly resolvedFindings: readonly Pathed[];
  readonly unchangedFindings: readonly Pathed[];
  readonly changedMetrics: readonly Pathed[];
};

type Outcome<Tool extends object, Result extends OutcomeResult> = {
  readonly tool: Tool;
  readonly result: Result;
  readonly outside?: number;
};

export function isInScope(findingPath: unknown, scope: Scope | undefined): boolean {
  return (
    scope === undefined ||
    scope.paths.some(
      (scopePath) =>
        findingPath === scopePath ||
        (typeof findingPath === 'string' && findingPath.startsWith(`${scopePath}/`)),
    )
  );
}

function keptInScope<Entry extends Pathed>(entries: readonly Entry[], scope: Scope): Entry[] {
  return entries.filter((entry) => isInScope(entry.path, scope));
}

export function scopeOutcomes<Tool extends object, Result extends OutcomeResult>(
  outcomes: readonly Outcome<Tool, Result>[],
  scope: Scope | undefined,
): readonly Outcome<Tool, Result>[] {
  if (scope === undefined) {
    return outcomes;
  }
  return outcomes.map(({ tool, result }) => {
    const scoped = {
      ...result,
      newFindings: keptInScope(result.newFindings, scope),
      resolvedFindings: keptInScope(result.resolvedFindings, scope),
      unchangedFindings: keptInScope(result.unchangedFindings, scope),
      changedMetrics: keptInScope(result.changedMetrics, scope),
    };
    return {
      tool: {
        ...tool,
        new: scoped.newFindings.length,
        resolved: scoped.resolvedFindings.length,
        unchanged: scoped.unchangedFindings.length,
        changedMetrics: scoped.changedMetrics.length,
      },
      result: scoped,
      outside: result.newFindings.length - scoped.newFindings.length,
    };
  });
}

export function scopeNotes<Note extends Pathed>(
  notes: readonly Note[],
  scope: Scope | undefined,
): Note[] {
  return notes.filter(
    (note) => note.path === undefined || note.path === '.' || isInScope(note.path, scope),
  );
}

export function scopeSummary(
  scope: Scope | undefined,
  outside: number,
): { readonly scope?: { readonly paths: readonly string[]; readonly outside: number } } {
  return scope === undefined ? {} : { scope: { paths: scope.paths, outside } };
}

export function projectLine(summary: unknown): string[] {
  const projectPath = fieldOf(summary, 'projectPath');
  return typeof projectPath === 'string' && projectPath !== '.' ? [`Project: ${projectPath}`] : [];
}

export function scopeLine(summary: unknown): string[] {
  const scoped = fieldOf(summary, 'scope');
  if (scoped === undefined) {
    return [];
  }
  const paths = textsOf(fieldOf(scoped, 'paths'));
  const outside = numberOr(fieldOf(scoped, 'outside'), 0);
  const leftOut =
    outside === 0
      ? ''
      : ` (${String(outside)} ${outside === 1 ? 'finding' : 'findings'} outside it not shown)`;
  return [`Scope: ${paths.join(', ')}${leftOut}`];
}
