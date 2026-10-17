import { availableParallelism } from 'node:os';
import { executeAnalyzerTask, installShutdownHandlers } from './process.mjs';
import { indexTasks, dependencyOrder, byDescendingExecutionPriority } from './tasks.mjs';
import { createWeightedSemaphore } from './capacity.mjs';
import { createProgressReporter, writeToDescriptor } from './progress.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const DEFAULT_MAX_PARALLEL = 4;

export function resolveMaxParallel(environment = process.env, available = availableParallelism()) {
  const configured = environment.NITPICKER_MAX_PARALLEL;
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
  tasks,
  {
    maxParallel = resolveMaxParallel(),
    execute = executeAnalyzerTask,
    signal,
    onSettled = descriptorProgress(tasks),
  } = {},
) {
  if (!Number.isInteger(maxParallel) || maxParallel < 1) {
    throw new TypeError('maxParallel must be a positive integer');
  }
  if (typeof execute !== 'function') {
    throw new TypeError('execute must be a function');
  }
  const tasksByName = indexTasks(tasks);
  const orderedTasks = dependencyOrder(byDescendingExecutionPriority(tasks), tasksByName);

  const semaphore = createWeightedSemaphore(maxParallel);
  const groupSemaphores = new Map();
  const taskPromises = new Map();

  for (const task of orderedTasks) {
    const dependencies = task.dependencies.map(
      (name) =>
        taskPromises.get(name) ??
        Promise.resolve({
          name,
          error: `Analyzer dependency ${name} is missing for ${task.name}`,
          missing: true,
        }),
    );
    const outcome = runTask(task, dependencies, {
      semaphore,
      groupSemaphores,
      maxParallel,
      execute,
      signal,
    });
    taskPromises.set(task.name, reportWhenSettled(outcome, onSettled));
  }
  const outcomes = await Promise.all(tasks.map((task) => taskPromises.get(task.name)));
  return summarizeOutcomes(outcomes);
}

function descriptorProgress(tasks) {
  const progress = tasks?.[0]?.progress;
  return progress === undefined
    ? undefined
    : createProgressReporter({
        write: writeToDescriptor,
        label: progress.label,
        total: tasks.length,
      });
}

async function reportWhenSettled(outcomePromise, onSettled) {
  const outcome = await outcomePromise;
  onSettled?.(progressEvent(outcome));
  return outcome;
}

async function runTask(
  task,
  dependencies,
  { semaphore, groupSemaphores, maxParallel, execute, signal },
) {
  const dependencyOutcomes = await Promise.all(dependencies);
  const failedDependency = dependencyOutcomes.find(hasFailed);
  if (failedDependency !== undefined) {
    return skippedOutcome(task.name, failedDependency);
  }
  if (signal?.aborted) {
    return cancelledOutcome(task.name);
  }

  const releaseGroup = await acquireGroup(task.concurrencyGroup, groupSemaphores);
  if (signal?.aborted) {
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

function summarizeOutcomes(outcomes) {
  const skipped = outcomes
    .filter((outcome) => outcome.skippedBecause !== undefined)
    .map((outcome) => ({ name: outcome.name, because: outcome.skippedBecause }));
  return {
    reports: outcomes
      .filter((outcome) => outcome.report !== undefined)
      .map((outcome) => [outcome.name, outcome.report]),
    errors: outcomes
      .filter((outcome) => outcome.error !== undefined)
      .map((outcome) => ({ name: outcome.name, message: outcome.error })),
    timings: outcomes.map(({ name, elapsedMs }) => ({ name, elapsedMs })),
    ...(skipped.length === 0 ? {} : { skipped }),
  };
}

export function progressEvent(outcome) {
  const { name, elapsedMs } = outcome;
  if (outcome.skippedBecause !== undefined) {
    return { name, status: 'skipped', elapsedMs, because: outcome.skippedBecause };
  }
  return { name, status: hasFailed(outcome) ? 'failed' : 'done', elapsedMs };
}

function hasFailed(outcome) {
  return (
    outcome.error !== undefined ||
    outcome.skippedBecause !== undefined ||
    (outcome.report?.findings ?? []).some(
      (finding) => finding.classification === 'tool-error' && finding.tool === outcome.name,
    )
  );
}

function skippedOutcome(taskName, failedDependency) {
  if (failedDependency.missing === true) {
    return { name: taskName, error: failedDependency.error, elapsedMs: 0 };
  }
  return {
    name: taskName,
    skippedBecause: failedDependency.skippedBecause ?? failedDependency.name,
    elapsedMs: 0,
  };
}

function cancelledOutcome(taskName) {
  return {
    name: taskName,
    error: `Analyzer scheduler cancelled before ${taskName} started`,
    elapsedMs: 0,
  };
}

function acquireGroup(groupName, groupSemaphores) {
  if (groupName === undefined) {
    return Promise.resolve(() => {});
  }
  let semaphore = groupSemaphores.get(groupName);
  if (semaphore === undefined) {
    semaphore = createWeightedSemaphore(1);
    groupSemaphores.set(groupName, semaphore);
  }
  return semaphore.acquire(1);
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  const shutdownController = new AbortController();
  installShutdownHandlers(shutdownController);
  try {
    const input = await readInput();
    const result = await runTaskGraph(input.tasks, { signal: shutdownController.signal });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `Analyzer scheduler failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function executeTimedTask(task, { execute, signal }) {
  const startedAt = Date.now();
  try {
    if (signal?.aborted) {
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
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - startedAt,
    };
  }
}
