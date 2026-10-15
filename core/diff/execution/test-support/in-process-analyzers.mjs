import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { analyzeJavaSnapshot } from '../../../../languages/java/adapters/java-runner.mjs';
import { parseJavaRunnerArguments } from '../../../../languages/java/adapters/java-policy.mjs';
import { headPolicyEnvironment } from '../../../../languages/typescript/preset/head-policy.mjs';
import { progressEvent } from '../analyzer-scheduler.mjs';
import { reportFromAnalyzerOutput } from '../process.mjs';
import { createProgressReporter } from '../progress.mjs';
import { runFakeAnalyzer } from './fake-analyzer.mjs';

const MAX_ANALYZER_OUTPUT_BYTES = 50 * 1024 * 1024;
const fakeAnalyzerPath = path.join(import.meta.dirname, 'fake-analyzer.mjs');
const javaRunnerPath = path.resolve(
  import.meta.dirname,
  '../../../../languages/java/adapters/java-runner.mjs',
);

const inProcessScripts = new Map([
  [fakeAnalyzerPath, runFakeAnalyzer],
  [javaRunnerPath, runJavaRunner],
]);

export function runTasksInProcess(tasks, headPolicyFile, { progress } = {}) {
  const reportSettled =
    progress === undefined
      ? undefined
      : createProgressReporter({
          write: (line) => progress.stream.write(line),
          label: progress.label,
          total: tasks.length,
        });
  const tasksByName = new Map(tasks.map((task) => [task.name, task]));
  const outcomes = new Map();
  withPolicyFile(headPolicyFile, () => {
    for (const task of dependencyOrder(tasks, tasksByName)) {
      const outcome = settleTask(task, { tasksByName, outcomes });
      outcomes.set(task.name, outcome);
      reportSettled?.(progressEvent(outcome));
    }
  });
  const results = tasks.map((task) => outcomes.get(task.name));
  return {
    reports: results
      .filter((outcome) => outcome.report !== undefined)
      .map((outcome) => [outcome.name, outcome.report]),
    errors: results
      .filter((outcome) => outcome.error !== undefined)
      .map((outcome) => ({ name: outcome.name, message: outcome.error })),
    timings: results.map(({ name, elapsedMs }) => ({ name, elapsedMs })),
  };
}

function withPolicyFile(headPolicyFile, operation) {
  if (headPolicyFile === undefined) {
    return operation();
  }
  const previous = process.env.NITPICKER_POLICY;
  Object.assign(process.env, headPolicyEnvironment(headPolicyFile));
  try {
    return operation();
  } finally {
    if (previous === undefined) {
      delete process.env.NITPICKER_POLICY;
    } else {
      process.env.NITPICKER_POLICY = previous;
    }
  }
}

function dependencyOrder(tasks, tasksByName) {
  const pending = tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (left, right) =>
        (right.task.executionPriority ?? 0) - (left.task.executionPriority ?? 0) ||
        left.index - right.index,
    )
    .map(({ task }) => task);
  const ordered = new Set();
  for (const task of pending) {
    if (isReady(task, ordered, tasksByName)) {
      ordered.add(task);
    } else {
      deferTask(pending, task, tasks.length);
    }
  }
  return [...ordered];
}

function isReady(task, ordered, tasksByName) {
  return task.dependencies.every(
    (name) => !tasksByName.has(name) || ordered.has(tasksByName.get(name)),
  );
}

function deferTask(pending, task, taskCount) {
  if (pending.length > taskCount ** 2) {
    throw new Error(`Analyzer dependencies of ${task.name} form a cycle`);
  }
  pending.push(task);
}

function settleTask(task, { tasksByName, outcomes }) {
  const dependencyOutcomes = task.dependencies.map((name) =>
    tasksByName.has(name) ? outcomes.get(name) : missingDependency(name, task),
  );
  const failedDependency = dependencyOutcomes.find(hasFailed);
  return failedDependency === undefined
    ? executeTask(task)
    : dependentOutcome(task, failedDependency);
}

function missingDependency(dependencyName, task) {
  return {
    name: dependencyName,
    error: `Analyzer dependency ${dependencyName} is missing for ${task.name}`,
    missing: true,
  };
}

function hasFailed(outcome) {
  return (
    outcome.error !== undefined ||
    outcome.skippedBecause !== undefined ||
    (outcome.report?.findings ?? []).some((finding) => finding.classification === 'tool-error')
  );
}

function dependentOutcome(task, failedDependency) {
  if (failedDependency.missing === true) {
    return { name: task.name, error: failedDependency.error, elapsedMs: 0 };
  }
  return {
    name: task.name,
    skippedBecause: failedDependency.skippedBecause ?? failedDependency.name,
    elapsedMs: 0,
  };
}

function executeTask(task) {
  const startedAt = Date.now();
  try {
    const output = inProcessOutput(task) ?? spawnedOutput(task);
    return {
      name: task.name,
      report: reportFromAnalyzerOutput(task, output),
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

function inProcessOutput(task) {
  const { command, args, env } = task.invocation;
  const script = command === process.execPath ? inProcessScripts.get(args[0]) : undefined;
  if (script === undefined || env !== undefined) {
    return undefined;
  }
  return script(args.slice(1));
}

function spawnedOutput(task) {
  const result = spawnSync(task.invocation.command, task.invocation.args, {
    cwd: task.invocation.cwd,
    env: task.invocation.env ?? process.env,
    encoding: 'utf8',
    timeout: task.timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: MAX_ANALYZER_OUTPUT_BYTES,
  });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`${task.name} timed out after ${String(task.timeoutMs)} ms`);
  }
  if (result.error?.code === 'ENOBUFS') {
    throw new Error(`${task.name} exceeded the analyzer output limit`);
  }
  if (result.error !== undefined) {
    throw result.error;
  }
  return {
    status: result.status,
    signal: result.signal,
    stdoutText: result.stdout,
    stderrText: result.stderr,
  };
}

function runJavaRunner(argv) {
  let parsed;
  try {
    parsed = parseJavaRunnerArguments(argv);
  } catch (error) {
    return { status: 2, signal: undefined, stdoutText: '', stderrText: error.message };
  }
  const report = analyzeJavaSnapshot(realpathSync(parsed.projectRoot), { policy: parsed.policy });
  return {
    status: 0,
    signal: undefined,
    stdoutText: `${JSON.stringify(report)}\n`,
    stderrText: '',
  };
}
