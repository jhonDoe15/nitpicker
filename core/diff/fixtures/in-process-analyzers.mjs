import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { analyzeJavaSnapshot } from '../../../languages/java/adapters/java-runner.mjs';
import { parseRunnerArguments } from '../../tooling/runner-arguments.mjs';
import { headPolicyEnvironment } from '../../../languages/typescript/preset/head-policy.mjs';
import { progressEvent, reportFromAnalyzerOutput } from '../analyzer-scheduler.mjs';
import { createProgressReporter } from '../progress.mjs';
import { runFakeAnalyzer } from './fake-analyzer.mjs';

// A test seam for `runAnalyzers({ runTasks })`: runs the analyzer task graph in the test process
// instead of spawning `analyzer-scheduler.mjs`, and runs the fixture analyzers (fake-analyzer.mjs,
// the Java runner with a fake gradle) as in-process function calls. Any other analyzer is spawned
// directly. Use it where a test is about diff, compare, report or CLI logic; the real subprocess
// path stays covered by analyzer-scheduler.test.mjs and by the e2e tests that do not pass it.

const MAX_ANALYZER_OUTPUT_BYTES = 50 * 1024 * 1024;
const fakeAnalyzerPath = path.join(import.meta.dirname, 'fake-analyzer.mjs');
const javaRunnerPath = path.resolve(
  import.meta.dirname,
  '../../../languages/java/adapters/java-runner.mjs',
);

const inProcessScripts = new Map([
  [fakeAnalyzerPath, (argv) => runFakeAnalyzer(argv)],
  [javaRunnerPath, runJavaRunner],
]);

/** Same contract as the scheduler subprocess: `{ reports, errors, timings }` in task order. */
export function runTasksInProcess(tasks, headPolicyFile, { progress } = {}) {
  const reportSettled =
    progress === undefined
      ? undefined
      : createProgressReporter({
          write: (line) => progress.stream.write(line),
          label: progress.label,
          total: tasks.length,
        });
  const environment = headPolicyFile === undefined ? {} : headPolicyEnvironment(headPolicyFile);
  const tasksByName = new Map(tasks.map((task) => [task.name, task]));
  const outcomes = new Map();

  const runTask = (task) => {
    const known = outcomes.get(task.name);
    if (known !== undefined) {
      return known;
    }
    let failedDependency;
    for (const dependencyName of task.dependencies) {
      const dependency = tasksByName.get(dependencyName);
      const outcome =
        dependency === undefined
          ? {
              name: dependencyName,
              error: `Analyzer dependency ${dependencyName} is missing for ${task.name}`,
              missing: true,
            }
          : runTask(dependency);
      failedDependency ??= hasFailed(outcome) ? outcome : undefined;
    }
    const outcome =
      failedDependency === undefined
        ? executeTask(task, environment)
        : dependentOutcome(task, failedDependency);
    outcomes.set(task.name, outcome);
    reportSettled?.(progressEvent(outcome));
    return outcome;
  };

  const ordered = tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (left, right) =>
        (right.task.executionPriority ?? 0) - (left.task.executionPriority ?? 0) ||
        left.index - right.index,
    );
  for (const { task } of ordered) {
    runTask(task);
  }
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

function executeTask(task, environment) {
  const startedAt = Date.now();
  try {
    const output = inProcessOutput(task, environment) ?? spawnedOutput(task, environment);
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

function inProcessOutput(task, environment) {
  const { command, args, env } = task.invocation;
  const script = command === process.execPath ? inProcessScripts.get(args[0]) : undefined;
  if (script === undefined || env !== undefined) {
    return undefined;
  }
  const previous = Object.fromEntries(
    Object.keys(environment).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, environment);
  try {
    return script(args.slice(1));
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

function spawnedOutput(task, environment) {
  const result = spawnSync(task.invocation.command, task.invocation.args, {
    cwd: task.invocation.cwd,
    env: task.invocation.env ?? { ...process.env, ...environment },
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
    parsed = parseRunnerArguments(argv);
  } catch (error) {
    return { status: 2, signal: null, stdoutText: '', stderrText: error.message };
  }
  const report = analyzeJavaSnapshot(realpathSync(parsed.projectRoot), { policy: parsed.policy });
  return { status: 0, signal: null, stdoutText: `${JSON.stringify(report)}\n`, stderrText: '' };
}
