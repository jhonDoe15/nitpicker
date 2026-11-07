export function isInScope(findingPath, scope) {
  return (
    scope === undefined ||
    scope.paths.some(
      (scopePath) => findingPath === scopePath || findingPath?.startsWith(`${scopePath}/`) === true,
    )
  );
}

function keptInScope(entries, scope) {
  return entries.filter((entry) => isInScope(entry.path, scope));
}

export function scopeOutcomes(outcomes, scope) {
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

export function scopeNotes(notes, scope) {
  return notes.filter(
    (note) => note.path === undefined || note.path === '.' || isInScope(note.path, scope),
  );
}

export function scopeSummary(scope, outside) {
  return scope === undefined ? {} : { scope: { paths: scope.paths, outside } };
}

export function scopeLine(summary) {
  if (summary?.scope === undefined) {
    return [];
  }
  const { paths, outside } = summary.scope;
  const leftOut =
    outside === 0
      ? ''
      : ` (${String(outside)} ${outside === 1 ? 'finding' : 'findings'} outside it not shown)`;
  return [`Scope: ${paths.join(', ')}${leftOut}`];
}
