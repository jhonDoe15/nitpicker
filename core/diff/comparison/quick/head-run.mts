import { runGit } from '../../git/repository/command.mjs';
import { createFindingsCache, runBaseWithCache } from '../../cache/findings-cache.mts';
import type { CacheStore } from '../../cache/cache-stores.mts';
import { cachedLine } from '../../execution/progress.mts';
import {
  type AnalyzerRun,
  analyzerRunOptions,
  runAnalyzers,
} from '../../execution/run-analyzers.mts';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import type { ProfiledAnalyzer } from '../../../../shared/values/analyzers.mts';
import { scopeToTouchedFiles } from './scope.mts';

export type RunSettings = {
  readonly repositoryRoot: string;
  readonly projectRelativePath: string;
  readonly headProjectRoot: string;
  readonly analyzers: readonly ProfiledAnalyzer[];
  readonly quick?: unknown;
  readonly cacheStore?: CacheStore | undefined;
  readonly configOverrides: unknown;
  readonly headPolicy: unknown;
  readonly progress?: { readonly write: (text: string) => unknown } | undefined;
  readonly scope?: unknown;
  readonly outputRoot: string;
  readonly runTasks?: unknown;
};

export type SnapshotRoots = {
  readonly baseProjectRoot: string;
  readonly headSnapshotRoot: string;
};

export type CachedRunRequest = {
  readonly settings: RunSettings;
  readonly mergeBaseSha: string;
  readonly projectRelativePath: string;
  readonly configOverrides: unknown;
  readonly headPolicy: unknown;
  readonly label: string;
  readonly analyzers: readonly unknown[];
  readonly policyRoot: string;
  readonly run: (analyzers: readonly unknown[]) => AnalyzerRun;
};

type HeadContext = {
  readonly settings: RunSettings;
  readonly comparison: { readonly mergeBaseSha: string; readonly headSha: string };
  readonly roots: SnapshotRoots;
  readonly layout: { readonly touchedPaths: ReadonlySet<string> };
  readonly headPolicyFile: unknown;
};

const gitOutput: (repositoryRoot: string, args: readonly string[]) => unknown = runGit;
const toolRoot: string = PACKAGE_ROOT;

export { toolRoot };

export function quickScoped(
  settings: RunSettings,
  layout: { readonly touchedPaths: ReadonlySet<string> },
  analyzers: readonly unknown[],
): readonly unknown[] {
  return settings.quick === undefined
    ? analyzers
    : scopeToTouchedFiles(analyzers, layout.touchedPaths);
}

export function runCached({
  settings,
  label,
  analyzers,
  policyRoot,
  run,
  ...key
}: CachedRunRequest): unknown {
  return runBaseWithCache({
    cache: createFindingsCache({ store: settings.cacheStore, directory: undefined, ...key }),
    analyzers,
    run,
    onCached: (count: unknown) =>
      settings.progress?.write(
        cachedLine({ label, count, directory: fieldOf(settings.cacheStore, 'directory') }),
      ),
    resolveContext: {
      liveProjectRoot: settings.headProjectRoot,
      policyRoot,
    },
  });
}

function runQuickHead(
  { settings, comparison, roots, layout }: HeadContext,
  run: (analyzers: readonly unknown[]) => AnalyzerRun,
): unknown {
  const analyzers = quickScoped(settings, layout, settings.analyzers);
  if (settings.quick === undefined || settings.cacheStore === undefined) {
    return run(analyzers);
  }
  const treeSha = textOf(
    gitOutput(settings.repositoryRoot, ['rev-parse', `${comparison.headSha}^{tree}`]),
  ).trim();
  return runCached({
    settings,
    mergeBaseSha: `${comparison.mergeBaseSha}:head-tree:${treeSha}`,
    projectRelativePath: settings.projectRelativePath,
    configOverrides: settings.configOverrides,
    headPolicy: settings.headPolicy,
    label: 'head',
    analyzers,
    policyRoot: roots.headSnapshotRoot,
    run,
  });
}

export function runHeadAnalyzers(context: HeadContext, baselineMovesFile: unknown): unknown {
  const { settings, roots, headPolicyFile } = context;
  return runQuickHead(context, (analyzers) =>
    runAnalyzers({
      analyzers,
      projectRoot: roots.headSnapshotRoot,
      policyRoot: roots.headSnapshotRoot,
      toolRoot,
      liveProjectRoot: settings.headProjectRoot,
      headPolicyFile,
      snapshot: 'head',
      baselineRoot: roots.baseProjectRoot,
      baselineMovesFile,
      mutationScope: fieldOf(settings.scope, 'paths'),
      ...analyzerRunOptions({ outputRoot: settings.outputRoot, runTasks: settings.runTasks }),
    }),
  );
}
