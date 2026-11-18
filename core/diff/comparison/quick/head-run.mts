import { runGit } from '../../git/repository/command.mjs';
import { createFindingsCache } from '../../cache/findings-cache.mts';
import { runBaseWithCache } from '../../cache/entries/run-with-cache.mts';
import { cachedLine, resumedLine } from '../../execution/progress.mts';
import { type ResumePlace, createResumeCache } from '../../cache/resume/resume-cache.mts';
import {
  type AnalyzerRun,
  analyzerRunOptions,
  runAnalyzers,
} from '../../execution/run-analyzers.mts';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import { scopeToTouchedFiles } from './scope.mts';
import { unlessSkipped } from '../snapshots/skips.mts';
import type { RunSettings, SkipPlan, SnapshotRoots } from '../snapshots/run-types.mts';
import type { Checkpoints } from '../../execution/tasks.mts';

export type CachedRunRequest = {
  readonly settings: RunSettings;
  readonly mergeBaseSha: string;
  readonly projectRelativePath: string;
  readonly configOverrides: unknown;
  readonly headPolicy: unknown;
  readonly label: string;
  readonly analyzers: readonly unknown[];
  readonly policyRoot: string;
  readonly run: (analyzers: readonly unknown[], checkpoints?: Checkpoints) => AnalyzerRun;
};

type HeadContext = {
  readonly settings: RunSettings;
  readonly comparison: { readonly mergeBaseSha: string; readonly headSha: string };
  readonly roots: SnapshotRoots;
  readonly layout: { readonly touchedPaths: ReadonlySet<string> };
  readonly headPolicyFile: unknown;
  readonly skipPlan: SkipPlan;
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

function headTree(settings: RunSettings, comparison: HeadContext['comparison']): string {
  return textOf(
    gitOutput(settings.repositoryRoot, ['rev-parse', `${comparison.headSha}^{tree}`]),
  ).trim();
}

export function headResumePlace(
  settings: RunSettings,
  comparison: HeadContext['comparison'],
): ResumePlace | undefined {
  if (settings.quick !== undefined || settings.cacheStore === undefined) {
    return undefined;
  }
  return {
    cacheStore: settings.cacheStore,
    kind: 'head',
    projectRelativePath: settings.projectRelativePath,
    treeKey: `${comparison.mergeBaseSha}:head-tree:${headTree(settings, comparison)}`,
    analyzers: settings.analyzers,
  };
}

function runQuickHead(
  { settings, comparison, roots, layout }: HeadContext,
  run: (analyzers: readonly unknown[], checkpoints?: Checkpoints) => AnalyzerRun,
): unknown {
  const analyzers = quickScoped(settings, layout, settings.analyzers);
  const place = headResumePlace(settings, comparison);
  if (place !== undefined) {
    return runResumable(settings, { place, analyzers, policyRoot: roots.headSnapshotRoot }, run);
  }
  if (settings.quick === undefined || settings.cacheStore === undefined) {
    return run(analyzers);
  }
  return runCached({
    settings,
    mergeBaseSha: `${comparison.mergeBaseSha}:head-tree:${headTree(settings, comparison)}`,
    projectRelativePath: settings.projectRelativePath,
    configOverrides: settings.configOverrides,
    headPolicy: settings.headPolicy,
    label: 'head',
    analyzers,
    policyRoot: roots.headSnapshotRoot,
    run,
  });
}

function runResumable(
  settings: RunSettings,
  {
    place,
    analyzers,
    policyRoot,
  }: {
    readonly place: ResumePlace;
    readonly analyzers: readonly unknown[];
    readonly policyRoot: string;
  },
  run: (analyzers: readonly unknown[], checkpoints?: Checkpoints) => AnalyzerRun,
): unknown {
  const resume = createResumeCache({
    ...place,
    configOverrides: [
      ...listOf(settings.configOverrides),
      { mutationScope: fieldOf(settings.scope, 'paths') },
    ],
    headPolicy: settings.headPolicy,
  });
  if (resume === undefined) {
    return run(analyzers);
  }
  return runBaseWithCache({
    cache: resume.cache,
    analyzers,
    run,
    onCached: (count: unknown) =>
      settings.progress?.write(resumedLine({ label: 'head', count, directory: resume.directory })),
    resolveContext: { liveProjectRoot: settings.headProjectRoot, policyRoot },
  });
}

export function runHeadAnalyzers(context: HeadContext, baselineMovesFile: unknown): unknown {
  const { settings, roots, headPolicyFile } = context;
  return runQuickHead(context, (scoped, checkpoints) =>
    unlessSkipped(scoped, context.skipPlan, (analyzers) =>
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
        checkpoints,
        ...analyzerRunOptions({ outputRoot: settings.outputRoot, runTasks: settings.runTasks }),
      }),
    ),
  );
}
