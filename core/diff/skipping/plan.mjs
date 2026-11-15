import { touchesInputs } from '../../../shared/input-sets/inputs.mjs';
import { changedFiles } from './changed-files.mjs';
import { hygieneReadsContent } from './hygiene-probe.mjs';

function linked(analyzer) {
  return [...(analyzer.dependencies ?? []), ...(analyzer.colocatedWith ?? [])];
}

function keepRequirements(analyzers, affected) {
  const byName = new Map(analyzers.map((analyzer) => [analyzer.name, analyzer]));
  const pending = [...affected];
  for (const name of pending) {
    const required = linked(byName.get(name) ?? {}).filter(
      (name) => byName.has(name) && !affected.has(name),
    );
    for (const requiredName of required) {
      affected.add(requiredName);
    }
    pending.push(...required);
  }
  return affected;
}

export function planAnalyzerRuns({ analyzers, changes, readsContent, roots }) {
  const affected = new Set(
    analyzers
      .filter(
        (analyzer) =>
          analyzer.custom === true ||
          changes.some((change) => touchesInputs(analyzer.inputs, change, { readsContent, roots })),
      )
      .map(({ name }) => name),
  );
  keepRequirements(analyzers, affected);
  return {
    skipped: analyzers.filter(({ name }) => !affected.has(name)).map(({ name }) => name),
    affected: analyzers.filter(({ name }) => affected.has(name)).map(({ name }) => name),
  };
}

export function planSnapshotSkips({ roots, analyzers, repositoryRoot, mergeBaseSha, headSha }) {
  const snapshots = { repositoryRoot, mergeBaseSha, headSha };
  return planAnalyzerRuns({
    analyzers,
    roots,
    changes: changedFiles(snapshots),
    readsContent: hygieneReadsContent(snapshots),
  });
}
