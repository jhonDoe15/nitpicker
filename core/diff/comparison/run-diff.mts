import { writeDiffReports } from '../reporting/reporters.mts';
import { partialRunField as partialRunOf } from '../reporting/partial-run/partial-run.mts';
import { runStamp } from '../reporting/run-stamp/run-stamp.mjs';
import path from 'node:path';
import { resolveComparison, captureWorkingTree, hasSameTree } from '../git/repository/git.mjs';
import { withHeadPolicyFile } from '../../../languages/typescript/preset/head-policy.mjs';
import { withMovesFile } from '../git/patches/moves-file.mts';
import { withComparisonKeys } from '../cache/keys/comparison-keys.mts';
import {
  type DiffReport,
  allSkippedReport,
  combineAnalyzerReports,
  noChangesReport,
} from './results.mts';
import { quickScoped, runCached, runHeadAnalyzers, toolRoot } from './quick/head-run.mts';
import { type Comparison, readSnapshotLayout, withSnapshotRoots } from './snapshots/layout.mts';
import { withPreparedDependencies } from './snapshots/dependencies.mts';
import { type AnalyzerRun, analyzerRunOptions, runAnalyzers } from '../execution/run-analyzers.mts';
import { carried, planOf, runnableOf, stopsEarly, unlessSkipped } from './snapshots/skips.mts';
import type { CaptureHead } from '../../staged/capture-index.mts';
import type {
  BaseSetup,
  DiffOptions,
  PolicyContext,
  RunContext,
  Settings,
  SnapshotContext,
} from './snapshots/diff-types.mts';
import { fieldsOf, listOf, textOf } from '../../../shared/values/readers.mts';
import { entriesOf } from '../../../shared/values/findings.mts';

export type { DiffOptions } from './snapshots/diff-types.mts';

const comparisonOf: (repositoryRoot: string, requestedBaseRef: unknown) => Comparison =
  resolveComparison;
const sameTree: (repositoryRoot: string, left: string, right: string) => boolean = hasSameTree;
const captureTree: CaptureHead = captureWorkingTree;
const writeReports: (
  outputRoot: string,
  report: DiffReport,
  location: { readonly projectPath: string; readonly repositoryRoot: string },
) => unknown = writeDiffReports;
const withPolicyFile: <T>(policy: unknown, operation: (file: unknown) => T) => T =
  withHeadPolicyFile;
const stampOf: (request: {
  readonly projectRoot: string;
  readonly outputRoot: string;
}) => Readonly<Record<string, unknown>> = runStamp;
export function runQualityDiff(options: DiffOptions): DiffReport {
  const settings = withDefaults(options);
  const startedAt = Date.now();
  const stamp = stampOf({ ...settings, projectRoot: settings.headProjectRoot });
  const comparison = resolveSnapshots(settings);
  const report = sameTree(settings.repositoryRoot, comparison.mergeBaseSha, comparison.headSha)
    ? noChangesReport({ ...settings, comparison, startedAt })
    : compareChanges(settings, comparison, startedAt);
  report.summary.elapsedMs = Date.now() - startedAt;
  Object.assign(report.summary, stamp, partialRunOf(settings.partialRun));
  report.text = writeReports(settings.outputRoot, report, {
    projectPath: settings.projectRelativePath,
    repositoryRoot: settings.repositoryRoot,
  });
  return report;
}

function compareChanges(settings: Settings, comparison: Comparison, startedAt: number): DiffReport {
  const layout = readSnapshotLayout(settings, comparison);
  return withSnapshotRoots({ settings, comparison, layout }, (roots) =>
    compareSnapshots({ settings, comparison, layout, roots, startedAt }),
  );
}

function isCapture(value: unknown): value is CaptureHead {
  return typeof value === 'function';
}

function given(value: unknown, fallback: unknown): unknown {
  return value === undefined ? fallback : value;
}

function withDefaults(options: DiffOptions): Settings {
  return {
    ...options,
    headProjectRoot:
      options.headProjectRoot ?? path.join(options.repositoryRoot, options.projectRelativePath),
    includeWorkingTree: options.includeWorkingTree === true,
    captureHead: isCapture(options.captureHead) ? options.captureHead : captureTree,
    additionalToolErrors: entriesOf(options.additionalToolErrors),
    configOverrides: listOf(options.configOverrides),
    headPolicy: given(options.headPolicy, {}),
  };
}

function resolveSnapshots({
  repositoryRoot,
  requestedBaseRef,
  includeWorkingTree,
  captureHead,
}: Settings): Comparison {
  const committed = comparisonOf(repositoryRoot, requestedBaseRef);
  return includeWorkingTree
    ? { ...committed, headSha: textOf(captureHead(repositoryRoot, committed.headSha)) }
    : committed;
}

function resolvedBaseSetup({ settings, layout, roots }: SnapshotContext): BaseSetup {
  return {
    analyzers: settings.analyzers,
    headPolicy: settings.headPolicy,
    configOverrides: settings.configOverrides,
    policyChanges: [],
    policyLoosenings: [],
    ...fieldsOf(
      settings.resolveBaseSetup?.({
        ...roots,
        liveProjectRoot: settings.headProjectRoot,
        moves: layout.moves,
        analyzers: settings.analyzers,
      }),
    ),
  };
}

function compareSnapshots(context: SnapshotContext): DiffReport {
  const { settings, roots, comparison, startedAt } = context;
  const skipPlan = planOf(settings, comparison);
  const baseSetup = resolvedBaseSetup(context);
  if (stopsEarly(skipPlan, baseSetup)) {
    return allSkippedReport({
      ...settings,
      comparison,
      startedAt,
      skippedAnalyzers: skipPlan.skipped,
    });
  }
  const setupContext = { ...context, baseSetup, skipPlan };
  return withPreparedDependencies(
    runnableOf(settings.analyzers, skipPlan),
    { ...roots, liveProjectRoot: settings.headProjectRoot, toolRoot },
    () => runWithPolicyFiles(setupContext),
  );
}

function runWithPolicyFiles(context: PolicyContext): DiffReport {
  const { settings, baseSetup } = context;
  return withPolicyFile(settings.headPolicy, (headPolicyFile) =>
    withBasePolicyFile(
      { basePolicy: baseSetup.headPolicy, headPolicy: settings.headPolicy, headPolicyFile },
      (basePolicyFile) => runAndCombine({ ...context, headPolicyFile, basePolicyFile }),
    ),
  );
}

function withBasePolicyFile<T>(
  {
    basePolicy,
    headPolicy,
    headPolicyFile,
  }: {
    readonly basePolicy: unknown;
    readonly headPolicy: unknown;
    readonly headPolicyFile: unknown;
  },
  operation: (file: unknown) => T,
): T {
  return JSON.stringify(basePolicy) === JSON.stringify(headPolicy)
    ? operation(headPolicyFile)
    : withPolicyFile(basePolicy, operation);
}

function runAndCombine(context: RunContext): DiffReport {
  const { settings, comparison, layout, startedAt, baseSetup } = context;
  const baseRun = runBaseSide(context);
  const ranHead = withMovesFile(layout.moves.files, (baselineMovesFile) =>
    runHeadAnalyzers(context, baselineMovesFile),
  );
  const { analyzers, headRun } = carried({
    analyzers: settings.analyzers,
    baseRun,
    headRun: ranHead,
    skipPlan: context.skipPlan,
  });
  return combineAnalyzerReports({
    analyzers,
    policyAnalyzers: settings.analyzers,
    skippedAnalyzers: context.skipPlan.skipped,
    baseRun,
    headRun,
    baseToHeadRenames: layout.moves.files,
    baseToHeadDirectories: layout.moves.directories,
    baseToHeadPackages: layout.moves.packages,
    touchedCode: layout.touchedCode,
    comparison,
    startedAt,
    additionalToolErrors: settings.additionalToolErrors,
    configOverrides: settings.configOverrides,
    policyChanges: baseSetup.policyChanges,
    policyLoosenings: listOf(baseSetup.policyLoosenings),
    policyKinds: baseSetup.policyKinds,
    policyDigest: baseSetup.policyDigest,
    policies: { base: baseSetup.headPolicy, head: settings.headPolicy },
    acceptPolicyChange: settings.acceptPolicyChange,
    scope: settings.scope,
    policyAcceptanceSource: settings.policyAcceptanceSource,
    reportsPolicy: settings.reportsPolicy !== false,
    quick: settings.quick,
    staged: settings.staged,
    notices: listOf(
      settings.describeNotices?.([...layout.touchedCode.changedLines.keys()], {
        mergeBaseSha: comparison.mergeBaseSha,
        touchedPaths: [...layout.touchedPaths],
      }),
    ),
  });
}

function runBaseAnalyzers(context: RunContext, baseAnalyzers: readonly unknown[]): AnalyzerRun {
  const { settings, roots, basePolicyFile } = context;
  return unlessSkipped(baseAnalyzers, context.skipPlan, (analyzersToRun) =>
    runAnalyzers({
      analyzers: analyzersToRun,
      projectRoot: roots.baseProjectRoot,
      policyRoot: roots.headSnapshotRoot,
      toolRoot,
      liveProjectRoot: settings.headProjectRoot,
      headPolicyFile: basePolicyFile,
      snapshot: 'base',
      baselineRoot: undefined,
      baselineMovesFile: undefined,
      mutationScope: undefined,
      ...analyzerRunOptions({ outputRoot: settings.outputRoot, runTasks: settings.runTasks }),
    }),
  );
}

function runBaseSide(context: RunContext): unknown {
  const { settings, comparison, layout, roots, baseSetup } = context;
  const analyzers = quickScoped(settings, layout, listOf(baseSetup.analyzers));
  if (settings.cacheStore === undefined) {
    return runBaseAnalyzers(context, analyzers);
  }
  return runCached({
    settings,
    mergeBaseSha: comparison.mergeBaseSha,
    projectRelativePath: layout.baseProjectRelativePath,
    configOverrides: baseSetup.configOverrides,
    headPolicy: baseSetup.headPolicy,
    label: 'base',
    analyzers: withComparisonKeys(analyzers, {
      touchedPaths: [...layout.touchedPaths],
      headRoot: roots.headSnapshotRoot,
      mergeBaseSha: comparison.mergeBaseSha,
      quick: settings.quick !== undefined,
    }),
    policyRoot: roots.headSnapshotRoot,
    run: (baseAnalyzers) => runBaseAnalyzers(context, baseAnalyzers),
  });
}
