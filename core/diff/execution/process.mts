import { ChildProcess, spawn } from 'node:child_process';
import { openOutputFile } from '../../tooling/output-file/output-file.mjs';
import {
  ANALYZER_TIMEOUT_KEY,
  ANALYZER_TIMEOUT_VARIABLE,
} from '../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../shared/messages/troubleshooting.mjs';
import { withoutHostCiOutputs } from '../../tooling/host-environment.mjs';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';
import type { AnalyzerTask } from './tasks.mts';
import { type AnalyzerReport, reportFromAnalyzerOutput } from './report/analyzer-report.mts';

type OutputFile = {
  readonly descriptor: number;
  readonly size: () => number;
  readonly read: (encoding: 'utf8') => unknown;
  readonly remove: () => void;
};

type OutputCollector = {
  readonly stderr: Buffer[];
  readonly collectStderr: (chunk: Buffer) => void;
  readonly exceeded: () => boolean;
  readonly stop: () => void;
};

type TaskController = {
  readonly terminate: (error: Error) => void;
  readonly finish: (operation: () => void) => void;
  readonly error: () => unknown;
  readonly recordError: (error: unknown) => void;
};

type ChildClose = {
  readonly failure: unknown;
  readonly status: unknown;
  readonly signal: unknown;
  readonly stdoutFile: OutputFile;
  readonly output: OutputCollector;
};

type Settle = {
  readonly resolve: (report: AnalyzerReport) => void;
  readonly reject: (error: unknown) => void;
};

const openOutput: () => OutputFile = openOutputFile;
const hostEnvironment: (environment: NodeJS.ProcessEnv) => NodeJS.ProcessEnv = withoutHostCiOutputs;
const timeoutKey: string = ANALYZER_TIMEOUT_KEY;
const timeoutVariable: string = ANALYZER_TIMEOUT_VARIABLE;
const configFile: string = CONFIG_FILE_NAME;

const MAX_ANALYZER_OUTPUT_BYTES = 50 * 1024 * 1024;

export const FORCE_KILL_DELAY_MS = 1_000;

const OUTPUT_POLL_INTERVAL_MS = 100;

const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

const activeChildren = new Set();

function analyzerEnvironment(
  environment: NodeJS.ProcessEnv,
  task: AnalyzerTask,
): NodeJS.ProcessEnv {
  return {
    ...hostEnvironment(environment),
    ...(task.configuredTimeout === true ? { [timeoutVariable]: String(task.timeoutMs) } : {}),
  };
}

function outputLimitError(task: AnalyzerTask): Error {
  return troubleshootingError(
    `${task.name} exceeded the analyzer output limit`,
    TROUBLESHOOTING_ANCHORS.analyzerCrashed,
  );
}

function settleClose(
  task: AnalyzerTask,
  { failure, status, signal, stdoutFile, output }: ChildClose,
  { resolve, reject }: Settle,
): void {
  const error = failure ?? (output.exceeded() ? outputLimitError(task) : undefined);
  if (error !== undefined) {
    reject(error);
    return;
  }
  try {
    resolve(
      reportFromAnalyzerOutput(task, {
        status,
        signal,
        stdoutText: textOf(stdoutFile.read('utf8')),
        stderrText: Buffer.concat(output.stderr).toString('utf8'),
      }),
    );
  } catch (error) {
    reject(error);
  }
}

function spawnAnalyzer(task: AnalyzerTask, stdoutDescriptor: number): ChildProcess {
  const child = spawn(task.invocation.command, task.invocation.args, {
    cwd: task.invocation.cwd,
    env: analyzerEnvironment(task.invocation.env ?? process.env, task),
    detached: process.platform !== 'win32',
    stdio: ['ignore', stdoutDescriptor, 'pipe'],
  });
  activeChildren.add(child);
  return child;
}

function createOutputCollector(stdoutFile: OutputFile, onOverflow: () => void): OutputCollector {
  const stderr: Buffer[] = [];
  const state = { stderrBytes: 0 };
  function exceeded(): boolean {
    return stdoutFile.size() + state.stderrBytes > MAX_ANALYZER_OUTPUT_BYTES;
  }
  function check(): void {
    if (exceeded()) {
      onOverflow();
    }
  }
  function collectStderr(chunk: Buffer): void {
    state.stderrBytes += chunk.length;
    if (exceeded()) {
      onOverflow();
      return;
    }
    stderr.push(chunk);
  }
  const poll = setInterval(check, OUTPUT_POLL_INTERVAL_MS);
  poll.unref();
  return {
    stderr,
    collectStderr,
    exceeded,
    stop(): void {
      clearInterval(poll);
    },
  };
}

function scheduleForceKill(child: ChildProcess): NodeJS.Timeout {
  const timer = setTimeout(() => {
    signalChildProcess(child, 'SIGKILL');
  }, FORCE_KILL_DELAY_MS);
  timer.unref();
  return timer;
}

function timeoutMessage(task: AnalyzerTask): string {
  return (
    `${task.name} timed out after ${String(task.timeoutMs)} ms. To give it more time, set ` +
    `"${timeoutKey}": { "${task.name}": <minutes> } in ${configFile}`
  );
}

function createTaskController(child: ChildProcess, task: AnalyzerTask): TaskController {
  const errors = new Map<string, unknown>();
  const state: { settled: boolean; forceKillTimeout: NodeJS.Timeout | undefined } = {
    settled: false,
    forceKillTimeout: undefined,
  };
  const timeout = setTimeout(() => {
    terminate(troubleshootingError(timeoutMessage(task), TROUBLESHOOTING_ANCHORS.analyzerTimeout));
  }, task.timeoutMs);
  function terminate(error: Error): void {
    if (errors.has('termination')) return;
    errors.set('termination', error);
    clearTimeout(timeout);
    signalChildProcess(child, 'SIGTERM');
    state.forceKillTimeout = scheduleForceKill(child);
  }
  function finish(operation: () => void): void {
    if (state.settled) return;
    state.settled = true;
    clearTimeout(timeout);
    clearTimeout(state.forceKillTimeout);
    signalChildProcess(child, 'SIGKILL');
    activeChildren.delete(child);
    operation();
  }
  return {
    terminate,
    finish,
    error: () => errors.get('termination') ?? errors.get('child'),
    recordError(error: unknown): void {
      errors.set('child', error);
    },
  };
}

export async function executeAnalyzerTask(task: AnalyzerTask): Promise<AnalyzerReport> {
  const stdoutFile = openOutput();
  try {
    return await runAnalyzerChild(task, stdoutFile);
  } finally {
    stdoutFile.remove();
  }
}

function runAnalyzerChild(task: AnalyzerTask, stdoutFile: OutputFile): Promise<AnalyzerReport> {
  return new Promise((resolve, reject) => {
    const child = spawnAnalyzer(task, stdoutFile.descriptor);
    const controller = createTaskController(child, task);
    const output = createOutputCollector(stdoutFile, () => {
      controller.terminate(outputLimitError(task));
    });
    child.stderr?.on('data', output.collectStderr);
    child.on('error', (error: Error) => {
      controller.recordError(error);
    });
    child.on('close', (status, signal) => {
      controller.finish(() => {
        output.stop();
        settleClose(
          task,
          { failure: controller.error(), status, signal, stdoutFile, output },
          { resolve, reject },
        );
      });
    });
  });
}

function signalChildProcess(
  child: ChildProcess,
  signal: NodeJS.Signals,
): { readonly kind: string; readonly error: unknown } | undefined {
  if (child.pid === undefined) {
    return undefined;
  }
  if (process.platform !== 'win32' && signalProcessGroup(child.pid, signal)) return undefined;
  try {
    child.kill(signal);
  } catch (error) {
    return { kind: 'signal-failed', error };
  }
  return undefined;
}

function signalActiveChildren(signal: NodeJS.Signals): void {
  for (const child of activeChildren) {
    if (child instanceof ChildProcess) {
      signalChildProcess(child, signal);
    }
  }
}

export function installShutdownHandlers(
  shutdownController: AbortController,
  { forceKillDelayMs = FORCE_KILL_DELAY_MS }: { readonly forceKillDelayMs?: number } = {},
): void {
  let isShuttingDown = false;
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;
      process.exitCode = 2;
      shutdownController.abort();
      signalActiveChildren('SIGTERM');
      const forceKillTimeout = setTimeout(() => {
        signalActiveChildren('SIGKILL');
      }, forceKillDelayMs);
      forceKillTimeout.unref();
    });
  }
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    return fieldOf(error, 'code') === 'ESRCH';
  }
}
