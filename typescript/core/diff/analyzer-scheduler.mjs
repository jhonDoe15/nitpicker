import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAnalyzerReport } from './finding-schema.mjs';

const DEFAULT_MAX_PARALLEL = 4;
const MAX_ANALYZER_OUTPUT_BYTES = 50 * 1024 * 1024;
const FORCE_KILL_DELAY_MS = 1_000;
const activeChildren = new Set();

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
  { maxParallel = resolveMaxParallel(), execute = executeAnalyzerTask, signal } = {},
) {
  if (!Number.isInteger(maxParallel) || maxParallel < 1) {
    throw new TypeError('maxParallel must be a positive integer');
  }
  if (typeof execute !== 'function') {
    throw new TypeError('execute must be a function');
  }
  const tasksByName = indexTasks(tasks);
  validateAcyclicGraph(tasksByName);

  const semaphore = new WeightedSemaphore(maxParallel);
  const groupSemaphores = new Map();
  const taskPromises = new Map();

  function scheduleTask(task) {
    const scheduled = taskPromises.get(task.name);
    if (scheduled !== undefined) {
      return scheduled;
    }

    const dependencyPromises = task.dependencies.map((dependencyName) => {
      const dependency = tasksByName.get(dependencyName);
      if (dependency === undefined) {
        return Promise.resolve({
          name: dependencyName,
          error: `Analyzer dependency ${dependencyName} is missing for ${task.name}`,
        });
      }
      return scheduleTask(dependency);
    });
    const taskPromise = runTask(
      task,
      dependencyPromises,
      semaphore,
      groupSemaphores,
      maxParallel,
      execute,
      signal,
    );
    taskPromises.set(task.name, taskPromise);
    return taskPromise;
  }

  for (const task of byDescendingExecutionPriority(tasks)) {
    scheduleTask(task);
  }
  const outcomes = await Promise.all(tasks.map((task) => taskPromises.get(task.name)));
  return {
    reports: outcomes
      .filter((outcome) => outcome.report !== undefined)
      .map((outcome) => [outcome.name, outcome.report]),
    errors: outcomes
      .filter((outcome) => outcome.error !== undefined)
      .map((outcome) => ({ name: outcome.name, message: outcome.error })),
    timings: outcomes.map(({ name, elapsedMs }) => ({ name, elapsedMs })),
  };
}

async function runTask(
  task,
  dependencies,
  semaphore,
  groupSemaphores,
  maxParallel,
  execute,
  signal,
) {
  const dependencyOutcomes = await Promise.all(dependencies);
  const failedDependency = dependencyOutcomes.find((outcome) => outcome.error !== undefined);
  if (failedDependency !== undefined) {
    return {
      name: task.name,
      error: `Analyzer dependency ${failedDependency.name} failed or did not run`,
      elapsedMs: 0,
    };
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
  } finally {
    releaseCapacity();
    releaseGroup();
  }
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
    semaphore = new WeightedSemaphore(1);
    groupSemaphores.set(groupName, semaphore);
  }
  return semaphore.acquire(1);
}

export function executeAnalyzerTask(task) {
  return new Promise((resolve, reject) => {
    const child = spawn(task.invocation.command, task.invocation.args, {
      cwd: task.invocation.cwd,
      env: task.invocation.env ?? process.env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeChildren.add(child);
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let terminationError;
    let childError;
    let settled = false;
    const timeout = setTimeout(() => {
      terminate(new Error(`${task.name} timed out after ${String(task.timeoutMs)} ms`));
    }, task.timeoutMs);
    let forceKillTimeout;

    const collect = (chunks) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_ANALYZER_OUTPUT_BYTES) {
        terminate(new Error(`${task.name} exceeded the analyzer output limit`));
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', (error) => {
      childError = error;
    });
    child.on('close', (status, signal) =>
      finish(() => {
        if (terminationError !== undefined) {
          reject(terminationError);
          return;
        }
        if (childError !== undefined) {
          reject(childError);
          return;
        }
        const stdoutText = Buffer.concat(stdout).toString('utf8');
        const stderrText = Buffer.concat(stderr).toString('utf8');
        if (!task.acceptedExitCodes.includes(status)) {
          const exit = status === null ? `signal ${signal ?? 'unknown'}` : `exit ${String(status)}`;
          const detail = stderrText.trim() || stdoutText.trim() || 'no diagnostic output';
          reject(new Error(`${task.name} crashed with ${exit}: ${detail}`));
          return;
        }
        try {
          resolve(parseReport(stdoutText, task.name));
        } catch (error) {
          reject(error);
        }
      }),
    );

    function terminate(error) {
      if (terminationError !== undefined) {
        return;
      }
      terminationError = error;
      clearTimeout(timeout);
      signalChildProcess(child, 'SIGTERM');
      forceKillTimeout = setTimeout(() => {
        signalChildProcess(child, 'SIGKILL');
      }, FORCE_KILL_DELAY_MS);
      forceKillTimeout.unref();
    }

    function finish(operation) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      clearTimeout(forceKillTimeout);
      signalChildProcess(child, 'SIGKILL');
      activeChildren.delete(child);
      operation();
    }
  });
}

function signalChildProcess(child, signal) {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code === 'ESRCH') {
        return;
      }
    }
  }
  try {
    child.kill(signal);
  } catch {}
}

function installShutdownHandlers(shutdownController) {
  let isShuttingDown = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;
      process.exitCode = 2;
      shutdownController.abort();
      for (const child of activeChildren) {
        signalChildProcess(child, 'SIGTERM');
      }
      const forceKillTimeout = setTimeout(() => {
        for (const child of activeChildren) {
          signalChildProcess(child, 'SIGKILL');
        }
      }, FORCE_KILL_DELAY_MS);
      forceKillTimeout.unref();
    });
  }
}

function parseReport(stdout, analyzerName) {
  let rawReport;
  try {
    rawReport = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${analyzerName} did not produce valid JSON`, { cause: error });
  }
  const report = parseAnalyzerReport(rawReport, analyzerName);
  const mismatchedFinding = report.findings.find((finding) => finding.tool !== analyzerName);
  if (mismatchedFinding !== undefined) {
    throw new Error(
      `${analyzerName} emitted a finding for unexpected tool ${mismatchedFinding.tool}`,
    );
  }
  return report;
}

function validateTask(task) {
  if (typeof task?.name !== 'string' || task.name.length === 0) {
    throw new TypeError('Analyzer task name must be a non-empty string');
  }
  if (
    !Array.isArray(task.dependencies) ||
    task.dependencies.some((dependency) => typeof dependency !== 'string')
  ) {
    throw new TypeError(`${task.name} dependencies must be strings`);
  }
  if (!Number.isInteger(task.concurrencyWeight) || task.concurrencyWeight < 1) {
    throw new TypeError(`${task.name} concurrencyWeight must be a positive integer`);
  }
  if (
    task.concurrencyGroup !== undefined &&
    (typeof task.concurrencyGroup !== 'string' || task.concurrencyGroup.length === 0)
  ) {
    throw new TypeError(`${task.name} concurrencyGroup must be a non-empty string`);
  }
  if (
    task.executionPriority !== undefined &&
    (!Number.isSafeInteger(task.executionPriority) || task.executionPriority < 0)
  ) {
    throw new TypeError(`${task.name} executionPriority must be a non-negative safe integer`);
  }
  if (!Number.isInteger(task.timeoutMs) || task.timeoutMs < 1) {
    throw new TypeError(`${task.name} timeoutMs must be a positive integer`);
  }
  if (
    !Array.isArray(task.acceptedExitCodes) ||
    task.acceptedExitCodes.some((status) => !Number.isInteger(status) || status < 0)
  ) {
    throw new TypeError(`${task.name} acceptedExitCodes must be non-negative integers`);
  }
  if (
    typeof task.invocation !== 'object' ||
    task.invocation === null ||
    typeof task.invocation.command !== 'string' ||
    !Array.isArray(task.invocation.args) ||
    task.invocation.args.some((argument) => typeof argument !== 'string')
  ) {
    throw new TypeError(`${task.name} invocation is invalid`);
  }
}

function byDescendingExecutionPriority(tasks) {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (left, right) =>
        (right.task.executionPriority ?? 0) - (left.task.executionPriority ?? 0) ||
        left.index - right.index,
    )
    .map(({ task }) => task);
}

function indexTasks(tasks) {
  if (!Array.isArray(tasks)) {
    throw new TypeError('Analyzer tasks must be an array');
  }
  const tasksByName = new Map();
  for (const task of tasks) {
    validateTask(task);
    if (tasksByName.has(task.name)) {
      throw new Error(`Duplicate analyzer task: ${task.name}`);
    }
    tasksByName.set(task.name, task);
  }
  return tasksByName;
}

function validateAcyclicGraph(tasksByName) {
  const visited = new Set();
  const visiting = [];

  function visit(task) {
    if (visited.has(task.name)) {
      return;
    }
    const cycleStart = visiting.indexOf(task.name);
    if (cycleStart !== -1) {
      const cycle = [...visiting.slice(cycleStart), task.name];
      throw new Error(`Analyzer dependency cycle: ${cycle.join(' -> ')}`);
    }

    visiting.push(task.name);
    for (const dependencyName of task.dependencies) {
      const dependency = tasksByName.get(dependencyName);
      if (dependency !== undefined) {
        visit(dependency);
      }
    }
    visiting.pop();
    visited.add(task.name);
  }

  for (const task of tasksByName.values()) {
    visit(task);
  }
}

class WeightedSemaphore {
  #available;
  #waiting = [];

  constructor(capacity) {
    this.#available = capacity;
  }

  acquire(weight) {
    return new Promise((resolve) => {
      this.#waiting.push({ weight, resolve });
      this.#drain();
    });
  }

  #drain() {
    while (this.#waiting[0]?.weight <= this.#available) {
      const waiter = this.#waiting.shift();
      this.#available -= waiter.weight;
      waiter.resolve(() => {
        this.#available += waiter.weight;
        this.#drain();
      });
    }
  }
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
