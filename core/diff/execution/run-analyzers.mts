import { analyzerName } from '../reporting/report-model.mjs';
import { type Invocation, validateAnalyzer, validateInvocation } from './validation/analyzers.mts';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { namedReports, namedToolErrors } from '../snapshot-root/snapshot-root.mjs';
import path from 'node:path';
import { describeError } from '../../../shared/messages/error-chain.mjs';
import { LOG_DIRECTORY } from '../reporting/reporters.mts';
import type { RunTasks } from './progress.mts';
import { runScheduler } from './scheduler/run-scheduler.mts';
import type { AnalyzerReport, ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, listOf, textOf } from '../../../shared/values/readers.mts';

export { selectAnalyzers } from './selection/select-analyzers.mts';
export { runScheduler } from './scheduler/run-scheduler.mts';

export type AnalyzerRun = {
  readonly reports: Map<string, AnalyzerReport>;
  readonly timings: Map<string, number | undefined>;
  readonly toolErrors: ReportEntry[];
  readonly skipped: Map<string, unknown>;
};

export type AnalyzerRequest = {
  readonly analyzers: readonly unknown[];
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: unknown;
  readonly snapshot: string;
  readonly baselineRoot: unknown;
  readonly baselineMovesFile: unknown;
  readonly liveProjectRoot: string;
  readonly headPolicyFile: unknown;
  readonly mutationScope: unknown;
  readonly logRoot: unknown;
  readonly runTasks: unknown;
};

type TaskContext = Omit<AnalyzerRequest, 'analyzers' | 'headPolicyFile' | 'runTasks'>;

type PreparedTask = {
  readonly name: string;
  readonly dependencies: readonly string[];
  readonly toleratedDependencyErrors: readonly string[];
  readonly concurrencyWeight: number;
  readonly concurrencyGroup: string | undefined;
  readonly executionPriority: number;
  readonly timeoutMs: number;
  readonly configuredTimeout: boolean;
  readonly reportedTools: readonly string[];
  readonly acceptedExitCodes: readonly number[];
  readonly invocation: Invocation;
};

type ScheduledRun = Omit<AnalyzerRun, 'reports'> & { readonly reports: Map<string, unknown> };

export type MetadataContext = { readonly liveProjectRoot: unknown; readonly policyRoot: unknown };

type Resolver = (root: unknown) => unknown;

const nameOf: (analyzer: unknown, index: number) => string = analyzerName;
const reportsNamed: (
  reports: Map<string, unknown>,
  snapshotRoot: object | undefined,
) => Map<string, AnalyzerReport> = namedReports;
const errorsNamed: (
  toolErrors: readonly ReportEntry[],
  snapshotRoot: object | undefined,
) => ReportEntry[] = namedToolErrors;
const errorText: (error: unknown) => string = describeError;
const logDirectory: string = LOG_DIRECTORY;

const DEFAULT_ANALYZER_TIMEOUT_MS = 5 * 60 * 1000;

function isResolver(value: unknown): value is Resolver {
  return typeof value === 'function';
}

function isRunTasks(value: unknown): value is RunTasks {
  return typeof value === 'function';
}

function isAnalyzerObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function resolveAnalyzerMetadata(
  analyzer: unknown,
  { liveProjectRoot, policyRoot }: MetadataContext,
): void {
  if (!isAnalyzerObject(analyzer)) {
    return;
  }
  const { resolveVersion, resolveConfigurationHash } = analyzer;
  if (isResolver(resolveVersion)) {
    analyzer['version'] = resolveVersion.call(analyzer, liveProjectRoot);
  }
  if (isResolver(resolveConfigurationHash)) {
    analyzer['configurationHash'] = resolveConfigurationHash.call(analyzer, policyRoot);
  }
}

export function runAnalyzers({
  analyzers,
  projectRoot,
  policyRoot,
  toolRoot,
  snapshot,
  baselineRoot,
  baselineMovesFile,
  liveProjectRoot,
  headPolicyFile,
  mutationScope,
  logRoot,
  runTasks,
}: AnalyzerRequest): AnalyzerRun {
  if (typeof liveProjectRoot !== 'string' || liveProjectRoot.length === 0) {
    throw new TypeError('liveProjectRoot is required');
  }

  const { tasks, toolErrors } = prepareTasks(analyzers, {
    projectRoot,
    policyRoot,
    toolRoot,
    snapshot,
    baselineRoot,
    baselineMovesFile,
    liveProjectRoot,
    mutationScope,
    logRoot,
  });

  const scheduled = scheduleTasks(tasks, {
    runTasks: isRunTasks(runTasks) ? runTasks : runScheduler,
    headPolicyFile,
    snapshot,
  });
  return namedRun(scheduled, toolErrors, { projectRoot, liveProjectRoot, snapshot });
}

function namedRun(
  scheduled: ScheduledRun,
  toolErrors: readonly ReportEntry[],
  {
    projectRoot,
    liveProjectRoot,
    snapshot,
  }: Pick<AnalyzerRequest, 'projectRoot' | 'liveProjectRoot' | 'snapshot'>,
): AnalyzerRun {
  const snapshotRoot = projectRoot === liveProjectRoot ? undefined : { projectRoot, snapshot };
  return {
    reports: reportsNamed(scheduled.reports, snapshotRoot),
    timings: scheduled.timings,
    toolErrors: errorsNamed([...toolErrors, ...scheduled.toolErrors], snapshotRoot),
    skipped: scheduled.skipped,
  };
}

function recordScheduled(outcome: ScheduledRun, scheduled: unknown, snapshot: string): void {
  for (const entry of listOf(fieldOf(scheduled, 'reports'))) {
    const [name, report] = listOf(entry);
    outcome.reports.set(textOf(name), report);
  }
  for (const error of listOf(fieldOf(scheduled, 'errors'))) {
    outcome.toolErrors.push({
      tool: fieldOf(error, 'name'),
      snapshot,
      message: fieldOf(error, 'message'),
    });
  }
  for (const skipped of listOf(fieldOf(scheduled, 'skipped'))) {
    outcome.skipped.set(textOf(fieldOf(skipped, 'name')), fieldOf(skipped, 'because'));
  }
  for (const timing of listOf(fieldOf(scheduled, 'timings'))) {
    const elapsedMs = fieldOf(timing, 'elapsedMs');
    outcome.timings.set(
      textOf(fieldOf(timing, 'name')),
      typeof elapsedMs === 'number' ? elapsedMs : undefined,
    );
  }
}

function scheduleTasks(
  tasks: readonly PreparedTask[],
  {
    runTasks,
    headPolicyFile,
    snapshot,
  }: { readonly runTasks: RunTasks; readonly headPolicyFile: unknown; readonly snapshot: string },
): ScheduledRun {
  const outcome: ScheduledRun = {
    reports: new Map(),
    timings: new Map(),
    toolErrors: [],
    skipped: new Map(),
  };
  if (tasks.length === 0) {
    return outcome;
  }
  try {
    recordScheduled(outcome, runTasks(tasks, headPolicyFile, { snapshot }), snapshot);
  } catch (error) {
    outcome.toolErrors.push({
      tool: 'analyzer-scheduler',
      snapshot,
      message: errorText(error),
    });
  }
  return outcome;
}

function prepareTasks(
  analyzers: readonly unknown[],
  context: TaskContext,
): { readonly tasks: PreparedTask[]; readonly toolErrors: ReportEntry[] } {
  const toolErrors: ReportEntry[] = [];
  const tasks: PreparedTask[] = [];

  for (const [index, analyzer] of analyzers.entries()) {
    const name = nameOf(analyzer, index);
    try {
      tasks.push(createTask(analyzer, context));
    } catch (error) {
      recoverAnalyzerVersion(analyzer);
      toolErrors.push({
        tool: name,
        snapshot: context.snapshot,
        message: errorText(error),
      });
    }
  }

  return { tasks, toolErrors };
}

export function analyzerRunOptions({
  outputRoot,
  runTasks,
}: {
  readonly outputRoot: string | undefined;
  readonly runTasks: unknown;
}): { readonly runTasks: unknown; readonly logRoot: string | undefined } {
  return {
    runTasks,
    logRoot:
      outputRoot === undefined ? undefined : path.join(path.resolve(outputRoot), logDirectory),
  };
}

function logLocation(
  logRoot: unknown,
  liveProjectRoot: string,
): { readonly logRoot?: string; readonly logLabel?: string } {
  if (typeof logRoot !== 'string') {
    return {};
  }
  const relative = path.relative(liveProjectRoot, logRoot);
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  return { logRoot, logLabel: inside ? relative.split(path.sep).join('/') : logRoot };
}

function createTask(analyzer: unknown, context: TaskContext): PreparedTask {
  const { projectRoot, policyRoot, toolRoot, snapshot, liveProjectRoot } = context;
  resolveAnalyzerMetadata(analyzer, { liveProjectRoot, policyRoot });
  validateAnalyzer(analyzer);
  const invocation = analyzer.createInvocation({
    projectRoot,
    policyRoot: analyzer['policyFromPackage'] === true ? PACKAGE_ROOT : policyRoot,
    projectPolicyRoot: policyRoot,
    toolRoot,
    snapshot,
    baselineRoot: context.baselineRoot,
    baselineMovesFile: context.baselineMovesFile,
    liveProjectRoot,
    ...(context.mutationScope === undefined ? {} : { mutationScope: context.mutationScope }),
    ...logLocation(context.logRoot, liveProjectRoot),
  });
  validateInvocation(analyzer.name, invocation);
  return {
    name: analyzer.name,
    dependencies: analyzer.dependencies ?? [],
    toleratedDependencyErrors: analyzer.toleratedDependencyErrors ?? [],
    concurrencyWeight: analyzer.concurrencyWeight ?? 1,
    concurrencyGroup: analyzer.concurrencyGroup,
    executionPriority: analyzer.executionPriority ?? 0,
    timeoutMs: analyzer.timeoutMs ?? DEFAULT_ANALYZER_TIMEOUT_MS,
    configuredTimeout: analyzer['configuredTimeout'] === true,
    reportedTools: analyzer.reportedTools ?? [],
    acceptedExitCodes: [0, ...(analyzer.findingExitCodes ?? [])],
    invocation,
  };
}

function recoverAnalyzerVersion(analyzer: unknown): void {
  if (
    isAnalyzerObject(analyzer) &&
    typeof analyzer['resolveVersion'] === 'function' &&
    analyzer['version'] === 'unresolved'
  ) {
    analyzer['version'] = 'unknown';
  }
}
