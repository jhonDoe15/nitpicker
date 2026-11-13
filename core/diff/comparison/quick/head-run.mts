import { runGit } from '../../git/repository/command.mjs';
import { createFindingsCache, runBaseWithCache } from '../../cache/findings-cache.mjs';
import { cachedLine } from '../../execution/progress.mjs';
import { analyzerRunOptions, runAnalyzers } from '../../execution/run-analyzers.mjs';
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
  readonly cacheStore?: unknown;
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

export type CachedRun = {
  readonly settings: RunSettings;
  readonly mergeBaseSha: string;
  readonly projectRelativePath: string;
  readonly configOverrides: unknown;
  readonly headPolicy: unknown;
  readonly label: string;
  readonly analyzers: unknown;
  readonly policyRoot: string;
  readonly run: (analyzers: unknown) => unknown;
};

type CacheKey = {
  readonly store: unknown;
  readonly directory: undefined;
  readonly mergeBaseSha: string;
  readonly projectRelativePath: string;
  readonly configOverrides: unknown;
  readonly headPolicy: unknown;
};

type AnalyzerRequest = {
  readonly analyzers: unknown;
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
  readonly snapshot: string;
  readonly baselineRoot: string | undefined;
  readonly baselineMovesFile: unknown;
  readonly liveProjectRoot: string;
  readonly headPolicyFile: unknown;
  readonly mutationScope: unknown;
  readonly logRoot: string | undefined;
  readonly runTasks: unknown;
};

type HeadContext = {
  readonly settings: RunSettings;
  readonly comparison: { readonly mergeBaseSha: string; readonly headSha: string };
  readonly roots: SnapshotRoots;
  readonly layout: { readonly touchedPaths: ReadonlySet<string> };
  readonly headPolicyFile: unknown;
};

const gitOutput: (repositoryRoot: string, args: readonly string[]) => unknown = runGit;
const findingsCache: (key: CacheKey) => unknown = createFindingsCache;
const withCache: (request: {
  readonly cache: unknown;
  readonly analyzers: unknown;
  readonly run: (analyzers: unknown) => unknown;
  readonly onCached: (count: unknown) => unknown;
  readonly resolveContext: { readonly liveProjectRoot: string; readonly policyRoot: string };
}) => unknown = runBaseWithCache;
const cachedText: (line: {
  readonly label: string;
  readonly count: unknown;
  readonly directory: unknown;
}) => string = cachedLine;
const runOptions: (settings: { readonly outputRoot: string; readonly runTasks: unknown }) => {
  readonly runTasks: unknown;
  readonly logRoot: string | undefined;
} = analyzerRunOptions;
const analyze: (request: AnalyzerRequest) => unknown = runAnalyzers;
const toolRoot: string = PACKAGE_ROOT;

export { analyze, runOptions, toolRoot };

export function quickScoped(
  settings: RunSettings,
  layout: { readonly touchedPaths: ReadonlySet<string> },
  analyzers: unknown,
): unknown {
  return settings.quick === undefined || !Array.isArray(analyzers)
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
}: CachedRun): unknown {
  return withCache({
    cache: findingsCache({ store: settings.cacheStore, directory: undefined, ...key }),
    analyzers,
    run,
    onCached: (count: unknown) =>
      settings.progress?.write(
        cachedText({ label, count, directory: fieldOf(settings.cacheStore, 'directory') }),
      ),
    resolveContext: {
      liveProjectRoot: settings.headProjectRoot,
      policyRoot,
    },
  });
}

function runQuickHead(
  { settings, comparison, roots, layout }: HeadContext,
  run: (analyzers: unknown) => unknown,
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
    analyze({
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
      ...runOptions({ outputRoot: settings.outputRoot, runTasks: settings.runTasks }),
    }),
  );
}
