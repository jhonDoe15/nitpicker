import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJava } from '../../../../languages/java/adapters/java-runner.mts';
import { runPython } from '../../../../languages/python/adapters/python-runner.mts';
import { headPolicyEnvironment } from '../../../../languages/typescript/preset/head-policy.mjs';
import { runHygieneCli } from '../../../../shared/hygiene/runner.mjs';
import { progressEvent } from '../graph/outcomes.mts';
import { reportFromAnalyzerOutput } from '../report/analyzer-report.mts';
import { createProgressReporter } from '../progress.mts';
import { runFakeAnalyzer } from './fake-analyzer.mts';
import {
  checkoutModulePath,
  checkoutModuleUrl,
} from '../../../../shared/paths/checkout-module.mjs';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import { callUntyped } from '../../../../languages/java/adapters/typed/java-values.mts';
import type { GraphResult, Outcome } from '../graph/outcomes.mts';
import { type AnalyzerTask, byDescendingExecutionPriority, indexTasks } from '../tasks.mts';
import type {
  HygieneCli,
  InProcessOptions,
  RunContext,
  Runner,
  Script,
  ScriptOutput,
  TaskMap,
} from './in-process-types.mts';

const pythonRunner: Runner = runPython;

function javaRunner(argv: readonly string[], options: { readonly spawn?: unknown }): unknown {
  return callUntyped(runJava, argv, options);
}
const policyEnvironment: (headPolicyFile: unknown) => NodeJS.ProcessEnv = headPolicyEnvironment;
const sourcePath: (file: string) => string = checkoutModulePath;
const hygieneCli: (cli: HygieneCli) => number = runHygieneCli;

const MAX_ANALYZER_OUTPUT_BYTES = 50 * 1024 * 1024;
const fakeAnalyzerPath = fileURLToPath(
  checkoutModuleUrl(new URL('./fake-analyzer.mjs', import.meta.url)),
);
const javaRunnerPath = sourcePath(
  path.resolve(import.meta.dirname, '../../../../languages/java/adapters/java-runner.mjs'),
);
const pythonRunnerPath = sourcePath(
  path.resolve(import.meta.dirname, '../../../../languages/python/adapters/python-runner.mjs'),
);

const cliPath = sourcePath(path.resolve(import.meta.dirname, '../../../cli.mjs'));

const inProcessScripts = new Map<string, Script>([
  [cliPath, inProcessHygiene],
  [fakeAnalyzerPath, runFakeAnalyzer],
  [javaRunnerPath, inProcessRunner(javaRunner)],
  [pythonRunnerPath, inProcessRunner(pythonRunner)],
]);

export function runTasksInProcess(
  taskList: readonly object[],
  headPolicyFile: unknown,
  { progress, spawn }: InProcessOptions = {},
): GraphResult {
  const tasksByName = indexTasks(taskList);
  const tasks = [...tasksByName.values()];
  const reportSettled =
    progress === undefined
      ? undefined
      : createProgressReporter({
          write: (line) => progress.stream.write(line),
          label: progress.label,
          total: tasks.length,
        });
  const outcomes = new Map<string, Outcome>();
  const environment = headPolicyFile === undefined ? {} : policyEnvironment(headPolicyFile);
  withPolicyFile(headPolicyFile, () => {
    for (const task of dependencyOrder(tasks, tasksByName)) {
      const outcome = settleTask(task, { tasksByName, outcomes, spawn, environment });
      outcomes.set(task.name, outcome);
      reportSettled?.(progressEvent(outcome));
    }
  });
  const results = tasks.flatMap((task) => outcomes.get(task.name) ?? []);
  return {
    reports: results
      .filter((outcome) => outcome.report !== undefined)
      .map((outcome): [string, unknown] => [outcome.name, outcome.report]),
    errors: results
      .filter((outcome) => outcome.error !== undefined)
      .flatMap(({ name, error }) => (error === undefined ? [] : [{ name, message: error }])),
    timings: results.map(({ name, elapsedMs }) => ({ name, elapsedMs })),
    skipped: results
      .filter((outcome) => outcome.skippedBecause !== undefined)
      .flatMap(({ name, skippedBecause }) =>
        skippedBecause === undefined ? [] : [{ name, because: skippedBecause }],
      ),
  };
}

function withPolicyFile<T>(headPolicyFile: unknown, operation: () => T): T {
  if (headPolicyFile === undefined) {
    return operation();
  }
  const previous = process.env['NITPICKER_POLICY'];
  Object.assign(process.env, policyEnvironment(headPolicyFile));
  try {
    return operation();
  } finally {
    if (previous === undefined) {
      delete process.env['NITPICKER_POLICY'];
    } else {
      process.env['NITPICKER_POLICY'] = previous;
    }
  }
}

function dependencyOrder(tasks: readonly AnalyzerTask[], tasksByName: TaskMap): AnalyzerTask[] {
  const pending = byDescendingExecutionPriority(tasks);
  const ordered = new Set<AnalyzerTask>();
  for (const task of pending) {
    if (isReady(task, ordered, tasksByName)) {
      ordered.add(task);
    } else {
      deferTask(pending, task, tasks.length);
    }
  }
  return [...ordered];
}

function isReady(
  task: AnalyzerTask,
  ordered: ReadonlySet<AnalyzerTask>,
  tasksByName: TaskMap,
): boolean {
  return task.dependencies.every(
    (name) => !tasksByName.has(name) || ordered.has(tasksByName.get(name) ?? task),
  );
}

function deferTask(pending: AnalyzerTask[], task: AnalyzerTask, taskCount: number): void {
  if (pending.length > taskCount ** 2) {
    throw new Error(`Analyzer dependencies of ${task.name} form a cycle`);
  }
  pending.push(task);
}

function settleTask(
  task: AnalyzerTask,
  {
    tasksByName,
    outcomes,
    ...run
  }: RunContext & { tasksByName: TaskMap; outcomes: ReadonlyMap<string, Outcome> },
): Outcome {
  const dependencyOutcomes = task.dependencies.map(
    (name) =>
      (tasksByName.has(name) ? outcomes.get(name) : undefined) ?? missingDependency(name, task),
  );
  const failedDependency = dependencyOutcomes.find(hasFailed);
  return failedDependency === undefined
    ? executeTask(task, run)
    : dependentOutcome(task, failedDependency);
}

function missingDependency(dependencyName: string, task: AnalyzerTask): Outcome {
  return {
    name: dependencyName,
    error: `${task.name} skipped: ${dependencyName} failed (see above)`,
    missing: true,
  };
}

function hasFailed(outcome: Outcome): boolean {
  return (
    outcome.error !== undefined ||
    outcome.skippedBecause !== undefined ||
    listOf(fieldOf(outcome.report, 'findings')).some(
      (finding) => fieldOf(finding, 'classification') === 'tool-error',
    )
  );
}

function dependentOutcome(task: AnalyzerTask, failedDependency: Outcome): Outcome {
  if (failedDependency.missing === true) {
    return { name: task.name, error: failedDependency.error ?? '', elapsedMs: 0 };
  }
  return {
    name: task.name,
    skippedBecause: failedDependency.skippedBecause ?? failedDependency.name,
    elapsedMs: 0,
  };
}

function executeTask(task: AnalyzerTask, run: RunContext): Outcome {
  const startedAt = Date.now();
  try {
    const output = inProcessOutput(task, run) ?? spawnedOutput(task);
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

function inProcessOutput(task: AnalyzerTask, run: RunContext): ScriptOutput | undefined {
  const { command, args, env } = task.invocation;
  const script = command === process.execPath ? inProcessScripts.get(args[0] ?? '') : undefined;
  if (script === undefined || env !== undefined) {
    return undefined;
  }
  return script(args.slice(1), run);
}

function spawnedOutput(task: AnalyzerTask): ScriptOutput {
  const result = spawnSync(task.invocation.command, task.invocation.args, {
    cwd: task.invocation.cwd,
    env: task.invocation.env ?? process.env,
    encoding: 'utf8',
    timeout: task.timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: MAX_ANALYZER_OUTPUT_BYTES,
  });
  if (fieldOf(result.error, 'code') === 'ETIMEDOUT') {
    throw new Error(`${task.name} timed out after ${String(task.timeoutMs)} ms`);
  }
  if (fieldOf(result.error, 'code') === 'ENOBUFS') {
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

function inProcessHygiene(argv: readonly string[], { environment }: RunContext): ScriptOutput {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const status = hygieneCli({
    commandArguments: argv.slice(1),
    stdout: { write: (text) => stdout.push(text) },
    stderr: { write: (text) => stderr.push(text) },
    environment,
  });
  return { status, signal: undefined, stdoutText: stdout.join(''), stderrText: stderr.join('') };
}

function inProcessRunner(analyze: Runner): Script {
  return (argv, options) => {
    try {
      const report = analyze(argv, options);
      return {
        status: 0,
        signal: undefined,
        stdoutText: `${JSON.stringify(report)}\n`,
        stderrText: '',
      };
    } catch (error) {
      return {
        status: 2,
        signal: undefined,
        stdoutText: '',
        stderrText: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
