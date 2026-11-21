import { analyzerName as nameOf } from '../reporting/report-model.mts';
import { type PreparedTask, type TaskContext, prepareTask } from './preparation/prepare-task.mts';
import { memoizedFileCounter } from './preparation/project-size.mts';
import {
  type CarryPlan,
  carriedNames,
  planCarried,
  withCarriedOutcomes,
} from './carried/carried-analyzers.mts';
import { namedReports, namedToolErrors } from '../snapshot-root/snapshot-root.mts';
import path from 'node:path';
import { describeError } from '../../../shared/messages/error-chain.mts';
import { LOG_DIRECTORY as logDirectory } from '../reporting/reporters.mts';
import type { RunTasks } from './progress.mts';
import type { Checkpoints } from './tasks.mts';
import { runScheduler } from './scheduler/run-scheduler.mts';
import type { AnalyzerMetadata, MetadataMap } from './report/analyzer-metadata.mts';
import type { AnalyzerReport, Finding, ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, listOf, textOf } from '../../../shared/values/readers.mts';

export { selectAnalyzers } from './selection/select-analyzers.mts';

export const SCHEDULER_TOOL = 'analyzer-scheduler';
export { runScheduler } from './scheduler/run-scheduler.mts';

export type AnalyzerRun = {
  readonly reports: Map<string, AnalyzerReport>;
  readonly timings: Map<string, number | undefined>;
  readonly toolErrors: ReportEntry[];
  readonly skipped: Map<string, unknown>;
  readonly metadata: MetadataMap;
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
  readonly checkpoints?: Checkpoints | undefined;
};

type ScheduledRun = Omit<AnalyzerRun, 'reports' | 'metadata'> & {
  readonly reports: Map<string, AnalyzerReport>;
};

const errorText: (error: unknown) => string = describeError;

function isRunTasks(value: unknown): value is RunTasks {
  return typeof value === 'function';
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
  checkpoints = new Map(),
}: AnalyzerRequest): AnalyzerRun {
  if (typeof liveProjectRoot !== 'string' || liveProjectRoot.length === 0) {
    throw new TypeError('liveProjectRoot is required');
  }

  const plan = planCarried(analyzers);
  const { tasks, toolErrors, metadata } = prepareTasks(
    { analyzers, plan },
    {
      projectRoot,
      policyRoot,
      toolRoot,
      snapshot,
      baselineRoot,
      baselineMovesFile,
      liveProjectRoot,
      mutationScope,
      logRoot,
    },
    checkpoints,
  );

  const scheduled = scheduleTasks(tasks, {
    runTasks: isRunTasks(runTasks) ? runTasks : runScheduler,
    headPolicyFile,
    snapshot,
  });
  const outcome = withCarriedOutcomes(
    { ...scheduled, metadata, toolErrors: [...toolErrors, ...scheduled.toolErrors] },
    plan,
  );
  return namedRun(outcome, { projectRoot, liveProjectRoot, snapshot });
}

function namedRun(
  scheduled: ScheduledRun & { readonly metadata: MetadataMap },
  {
    projectRoot,
    liveProjectRoot,
    snapshot,
  }: Pick<AnalyzerRequest, 'projectRoot' | 'liveProjectRoot' | 'snapshot'>,
): AnalyzerRun {
  const snapshotRoot = projectRoot === liveProjectRoot ? undefined : { projectRoot, snapshot };
  return {
    reports: namedReports(scheduled.reports, snapshotRoot),
    timings: scheduled.timings,
    toolErrors: namedToolErrors(scheduled.toolErrors, snapshotRoot),
    skipped: scheduled.skipped,
    metadata: scheduled.metadata,
  };
}

function isFinding(value: unknown): value is Finding {
  return typeof value === 'object' && value !== null;
}

function isAnalyzerReport(value: unknown): value is AnalyzerReport {
  return (
    Array.isArray(fieldOf(value, 'findings')) && listOf(fieldOf(value, 'findings')).every(isFinding)
  );
}

function recordScheduled(outcome: ScheduledRun, scheduled: unknown, snapshot: string): void {
  for (const entry of listOf(fieldOf(scheduled, 'reports'))) {
    const [name, report] = listOf(entry);
    if (isAnalyzerReport(report)) {
      outcome.reports.set(textOf(name), report);
    }
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
      tool: SCHEDULER_TOOL,
      snapshot,
      message: errorText(error),
    });
  }
  return outcome;
}

function prepareTasks(
  { analyzers, plan }: { readonly analyzers: readonly unknown[]; readonly plan: CarryPlan },
  context: TaskContext,
  checkpoints: Checkpoints,
): {
  readonly tasks: PreparedTask[];
  readonly toolErrors: ReportEntry[];
  readonly metadata: MetadataMap;
} {
  const metadata = new Map<unknown, AnalyzerMetadata>();
  const toolErrors: ReportEntry[] = [];
  const tasks: PreparedTask[] = [];
  const sizedContext = { ...context, countFiles: memoizedFileCounter() };

  for (const [index, analyzer] of analyzers.entries()) {
    const name = nameOf(analyzer, index);
    const preparation = prepareTask(
      analyzer,
      {
        ...sizedContext,
        carried: carriedNames(plan, analyzer).map((carried) => ({
          name: carried,
          checkpoint: checkpoints.get(carried),
        })),
      },
      metadata.get(analyzer),
    );
    metadata.set(analyzer, preparation.metadata);
    if (preparation.kind !== 'ready') {
      toolErrors.push({
        tool: name,
        snapshot: context.snapshot,
        message: errorText(preparation.error),
      });
      continue;
    }
    if (plan.scheduled.includes(analyzer)) {
      const checkpoint = checkpoints.get(name);
      tasks.push(checkpoint === undefined ? preparation.task : { ...preparation.task, checkpoint });
    }
  }

  return { tasks, toolErrors, metadata };
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
