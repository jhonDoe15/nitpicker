import { writeDiffReports } from '../reporting/reporters.mjs';
import { partialRunField } from '../reporting/partial-run/partial-run.mjs';
import path from 'node:path';
import { resolveComparison, captureWorkingTree, hasSameTree } from '../git/repository/git.mjs';
import { withHeadPolicyFile } from '../../../languages/typescript/preset/head-policy.mjs';
import { withMovesFile } from '../git/patches/moves-file.mjs';
import { combineAnalyzerReports, noChangesReport } from './results.mjs';
import {
  type RunSettings,
  type SnapshotRoots,
  analyze,
  quickScoped,
  runCached,
  runHeadAnalyzers,
  runOptions,
  toolRoot,
} from './quick/head-run.mts';
import {
  type Comparison,
  type SnapshotLayout,
  readSnapshotLayout,
  withSnapshotRoots,
} from './snapshots/layout.mts';
import { withPreparedDependencies } from './snapshots/dependencies.mts';
import { fieldsOf, textOf } from '../../../shared/values/readers.mts';

type CaptureHead = (repositoryRoot: string, headSha: string) => unknown;

type NoticeContext = { readonly mergeBaseSha: string; readonly touchedPaths: readonly string[] };

type BaseSnapshot = SnapshotRoots & {
  readonly liveProjectRoot: string;
  readonly moves: unknown;
  readonly analyzers: RunSettings['analyzers'];
};

export type DiffOptions = Omit<
  RunSettings,
  'headProjectRoot' | 'configOverrides' | 'headPolicy'
> & {
  readonly outputRoot: string;
  readonly headProjectRoot?: string | undefined;
  readonly requestedBaseRef?: unknown;
  readonly partialRun?: unknown;
  readonly includeWorkingTree?: true | undefined;
  readonly captureHead?: unknown;
  readonly staged?: unknown;
  readonly additionalToolErrors?: unknown;
  readonly configOverrides?: unknown;
  readonly headPolicy?: unknown;
  readonly resolveBaseSetup?: ((snapshot: BaseSnapshot) => unknown) | undefined;
  readonly describeNotices?:
    ((changedFiles: readonly string[], context: NoticeContext) => unknown) | undefined;
  readonly acceptPolicyChange?: unknown;
  readonly policyAcceptanceSource?: unknown;
  readonly reportsPolicy?: unknown;
  readonly warn?: unknown;
};

type Settings = Omit<DiffOptions, 'includeWorkingTree'> &
  RunSettings & {
    readonly includeWorkingTree: boolean;
    readonly captureHead: CaptureHead;
    readonly additionalToolErrors: unknown;
  };

type BaseSetup = {
  readonly analyzers: unknown;
  readonly headPolicy: unknown;
  readonly configOverrides: unknown;
  readonly policyChanges: unknown;
  readonly policyLoosenings: unknown;
  readonly policyKinds?: unknown;
  readonly policyDigest?: unknown;
};

type DiffReport = {
  readonly summary: { elapsedMs?: number; readonly [field: string]: unknown };
  text?: unknown;
};

type SnapshotContext = {
  readonly settings: Settings;
  readonly comparison: Comparison;
  readonly layout: SnapshotLayout;
  readonly roots: SnapshotRoots;
  readonly startedAt: number;
};

type PolicyContext = SnapshotContext & { readonly baseSetup: BaseSetup };

type RunContext = PolicyContext & {
  readonly headPolicyFile: unknown;
  readonly basePolicyFile: unknown;
};

const comparisonOf: (repositoryRoot: string, requestedBaseRef: unknown) => Comparison =
  resolveComparison;
const sameTree: (repositoryRoot: string, left: string, right: string) => boolean = hasSameTree;
const captureTree: CaptureHead = captureWorkingTree;
const unchangedReport: (context: object) => DiffReport = noChangesReport;
const combinedReport: (context: object) => DiffReport = combineAnalyzerReports;
const partialRunOf: (partialRun: unknown) => object = partialRunField;
const writeReports: (
  outputRoot: string,
  report: DiffReport,
  location: { readonly projectPath: string; readonly repositoryRoot: string },
) => unknown = writeDiffReports;
const withPolicyFile: <T>(policy: unknown, operation: (file: unknown) => T) => T =
  withHeadPolicyFile;
const withMoves: <T>(moves: unknown, operation: (file: unknown) => T) => T = withMovesFile;

export function runQualityDiff(options: DiffOptions): DiffReport {
  const settings = withDefaults(options);
  const startedAt = Date.now();
  const comparison = resolveSnapshots(settings);
  const report = sameTree(settings.repositoryRoot, comparison.mergeBaseSha, comparison.headSha)
    ? unchangedReport({ ...settings, comparison, startedAt })
    : compareChanges(settings, comparison, startedAt);
  report.summary.elapsedMs = Date.now() - startedAt;
  Object.assign(report.summary, partialRunOf(settings.partialRun));
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
    additionalToolErrors: given(options.additionalToolErrors, []),
    configOverrides: given(options.configOverrides, []),
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
  const { settings, roots } = context;
  const setupContext = { ...context, baseSetup: resolvedBaseSetup(context) };
  return withPreparedDependencies(
    settings.analyzers,
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
  const headRun = withMoves(layout.moves.files, (baselineMovesFile) =>
    runHeadAnalyzers(context, baselineMovesFile),
  );
  return combinedReport({
    analyzers: settings.analyzers,
    baseRun,
    headRun,
    baseToHeadRenames: layout.moves.files,
    baseToHeadDirectories: layout.moves.directories,
    touchedCode: layout.touchedCode,
    comparison,
    startedAt,
    additionalToolErrors: settings.additionalToolErrors,
    configOverrides: settings.configOverrides,
    policyChanges: baseSetup.policyChanges,
    policyLoosenings: baseSetup.policyLoosenings,
    policyKinds: baseSetup.policyKinds,
    policyDigest: baseSetup.policyDigest,
    policies: { base: baseSetup.headPolicy, head: settings.headPolicy },
    acceptPolicyChange: settings.acceptPolicyChange,
    scope: settings.scope,
    policyAcceptanceSource: settings.policyAcceptanceSource,
    reportsPolicy: settings.reportsPolicy !== false,
    quick: settings.quick,
    staged: settings.staged,
    notices:
      settings.describeNotices?.([...layout.touchedCode.changedLines.keys()], {
        mergeBaseSha: comparison.mergeBaseSha,
        touchedPaths: [...layout.touchedPaths],
      }) ?? [],
  });
}

function runBaseAnalyzers(context: RunContext, baseAnalyzers: unknown): unknown {
  const { settings, roots, basePolicyFile } = context;
  return analyze({
    analyzers: baseAnalyzers,
    projectRoot: roots.baseProjectRoot,
    policyRoot: roots.headSnapshotRoot,
    toolRoot,
    liveProjectRoot: settings.headProjectRoot,
    headPolicyFile: basePolicyFile,
    snapshot: 'base',
    baselineRoot: undefined,
    baselineMovesFile: undefined,
    mutationScope: undefined,
    ...runOptions({ outputRoot: settings.outputRoot, runTasks: settings.runTasks }),
  });
}

function runBaseSide(context: RunContext): unknown {
  const { settings, comparison, layout, roots, baseSetup } = context;
  const analyzers = quickScoped(settings, layout, baseSetup.analyzers);
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
    analyzers,
    policyRoot: roots.headSnapshotRoot,
    run: (baseAnalyzers) => runBaseAnalyzers(context, baseAnalyzers),
  });
}
