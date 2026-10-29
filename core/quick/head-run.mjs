import { runGit } from '../diff/git/repository/command.mjs';
import { createFindingsCache, runBaseWithCache } from '../diff/cache/findings-cache.mjs';
import { cachedLine } from '../diff/execution/progress.mjs';
import { scopeToTouchedFiles } from './scope.mjs';

export function quickScoped(settings, layout, analyzers) {
  return settings.quick === undefined
    ? analyzers
    : scopeToTouchedFiles(analyzers, layout.touchedPaths);
}

export function runQuickHead({ settings, comparison, roots, analyzers, run }) {
  if (settings.quick === undefined || settings.cacheStore === undefined) {
    return run(analyzers);
  }
  const treeSha = runGit(settings.repositoryRoot, [
    'rev-parse',
    `${comparison.headSha}^{tree}`,
  ]).trim();
  return runBaseWithCache({
    cache: createFindingsCache({
      store: settings.cacheStore,
      mergeBaseSha: `${comparison.mergeBaseSha}:head-tree:${treeSha}`,
      projectRelativePath: settings.projectRelativePath,
      configOverrides: settings.configOverrides,
      headPolicy: settings.headPolicy,
    }),
    analyzers,
    run,
    onCached: (count) => settings.progress?.write(cachedLine({ label: 'head', count })),
    resolveContext: {
      liveProjectRoot: settings.headProjectRoot,
      policyRoot: roots.headSnapshotRoot,
    },
  });
}
