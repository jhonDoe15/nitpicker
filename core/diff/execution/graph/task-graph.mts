import { availableParallelism } from 'node:os';
import { executeAnalyzerTask } from '../process.mts';
import {
  type AnalyzerTask,
  byDescendingExecutionPriority,
  dependencyOrder,
  indexTasks,
} from '../tasks.mts';
import { type Release, type Semaphore, createWeightedSemaphore } from '../capacity.mts';
import { createProgressReporter, writeToDescriptor } from '../progress.mts';
import { describeError } from '../../../../shared/messages/error-chain.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import {
  type GraphResult,
  type Outcome,
  type ProgressEvent,
  blockingDependency,
  cancelledOutcome,
  progressEvent,
  skippedOutcome,
  summarizeOutcomes,
} from './outcomes.mts';

type Executor = (task: AnalyzerTask) => unknown;

type OnSettled = ((event: ProgressEvent) => unknown) | undefined;

type GraphOptions = {
  readonly maxParallel?: number;
  readonly execute?: unknown;
  readonly signal?: AbortSignal | undefined;
  readonly onSettled?: OnSettled;
};

type TaskRun = {
  readonly semaphore: Semaphore;
  readonly groupSemaphores: Map<string, Semaphore>;
  readonly maxParallel: number;
  readonly execute: Executor;
  readonly signal: AbortSignal | undefined;
};

type TimedRun = { readonly execute: Executor; readonly signal: AbortSignal | undefined };

const errorText: (error: unknown) => string = describeError;

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function isExecutor(value: unknown): value is Executor {
  return typeof value === 'function';
}

const DEFAULT_MAX_PARALLEL = 4;

export function resolveMaxParallel(
  environment: Readonly<Record<string, string | undefined>>,
  available: number = availableParallelism(),
): number {
  const configured = environment['NITPICKER_MAX_PARALLEL'];
  if (configured === undefined) {
    return Math.max(1, Math.min(DEFAULT_MAX_PARALLEL, available));
  }
  const value = Number(configured);
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError('NITPICKER_MAX_PARALLEL must be a positive integer');
  }
  return value;
}

export async function runTaskGraph(
  tasks: unknown,
  {
    maxParallel = resolveMaxParallel({}),
    execute = executeAnalyzerTask,
    signal,
    onSettled = descriptorProgress(tasks),
  }: GraphOptions = {},
): Promise<GraphResult> {
  if (!Number.isInteger(maxParallel) || maxParallel < 1) {
    throw new TypeError('maxParallel must be a positive integer');
  }
  if (!isExecutor(execute)) {
    throw new TypeError('execute must be a function');
  }
  const tasksByName = indexTasks(tasks);
  const taskList = [...tasksByName.values()];
  const orderedTasks = dependencyOrder(byDescendingExecutionPriority(taskList), tasksByName);

  const taskPromises = scheduleTasks(orderedTasks, {
    run: {
      semaphore: createWeightedSemaphore(maxParallel),
      groupSemaphores: new Map<string, Semaphore>(),
      maxParallel,
      execute,
      signal,
    },
    onSettled,
  });
  const outcomes = await Promise.all(
    taskList.flatMap((task) => {
      const outcome = taskPromises.get(task.name);
      return outcome === undefined ? [] : [outcome];
    }),
  );
  return summarizeOutcomes(outcomes);
}

function scheduleTasks(
  orderedTasks: readonly AnalyzerTask[],
  { run, onSettled }: { readonly run: TaskRun; readonly onSettled: OnSettled },
): ReadonlyMap<string, Promise<Outcome>> {
  const taskPromises = new Map<string, Promise<Outcome>>();
  for (const task of orderedTasks) {
    const dependencies = task.dependencies.map(
      (name) =>
        taskPromises.get(name) ??
        Promise.resolve<Outcome>({
          name,
          error: `Analyzer dependency ${name} is missing for ${task.name}`,
          missing: true,
        }),
    );
    taskPromises.set(task.name, reportWhenSettled(runTask(task, dependencies, run), onSettled));
  }
  return taskPromises;
}

function descriptorProgress(tasks: unknown): OnSettled {
  const progress = fieldOf(fieldOf(tasks, '0'), 'progress');
  if (progress === undefined) {
    return undefined;
  }
  const report = createProgressReporter({
    write: writeToDescriptor,
    label: fieldOf(progress, 'label'),
    total: fieldOf(tasks, 'length'),
  });
  return (event) => report({ because: undefined, ...event });
}

async function reportWhenSettled(
  outcomePromise: Promise<Outcome>,
  onSettled: OnSettled,
): Promise<Outcome> {
  const outcome = await outcomePromise;
  onSettled?.(progressEvent(outcome));
  return outcome;
}

async function runTask(
  task: AnalyzerTask,
  dependencies: readonly Promise<Outcome>[],
  { semaphore, groupSemaphores, maxParallel, execute, signal }: TaskRun,
): Promise<Outcome> {
  const dependencyOutcomes = await Promise.all(dependencies);
  const failedDependency = blockingDependency(task, dependencyOutcomes);
  if (failedDependency !== undefined) {
    return skippedOutcome(task.name, failedDependency);
  }
  if (isAborted(signal)) {
    return cancelledOutcome(task.name);
  }

  const releaseGroup = await acquireGroup(task.concurrencyGroup, groupSemaphores);
  if (isAborted(signal)) {
    releaseGroup();
    return cancelledOutcome(task.name);
  }
  const releaseCapacity = await semaphore.acquire(Math.min(task.concurrencyWeight, maxParallel));
  try {
    return await executeTimedTask(task, { execute, signal });
  } finally {
    releaseCapacity();
    releaseGroup();
  }
}

function acquireGroup(
  groupName: string | undefined,
  groupSemaphores: Map<string, Semaphore>,
): Promise<Release> {
  if (groupName === undefined) {
    return Promise.resolve(() => undefined);
  }
  let semaphore = groupSemaphores.get(groupName);
  if (semaphore === undefined) {
    semaphore = createWeightedSemaphore(1);
    groupSemaphores.set(groupName, semaphore);
  }
  return semaphore.acquire(1);
}

async function executeTimedTask(
  task: AnalyzerTask,
  { execute, signal }: TimedRun,
): Promise<Outcome> {
  const startedAt = Date.now();
  try {
    if (isAborted(signal)) {
      return cancelledOutcome(task.name);
    }
    return {
      name: task.name,
      report: await execute(task),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      name: task.name,
      error: errorText(error),
      elapsedMs: Date.now() - startedAt,
    };
  }
}
