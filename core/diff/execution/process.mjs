import { spawn } from 'node:child_process';
import { openOutputFile } from '../../tooling/output-file.mjs';
import { parseAnalyzerReport } from '../comparison/finding-schema.mjs';

const MAX_ANALYZER_OUTPUT_BYTES = 50 * 1024 * 1024;

const FORCE_KILL_DELAY_MS = 1_000;

const activeChildren = new Set();

const HOST_CI_OUTPUT_VARIABLES = ['GITHUB_STEP_SUMMARY'];

function analyzerEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !HOST_CI_OUTPUT_VARIABLES.includes(name)),
  );
}

function outputFailure(task, stdoutFile, stderrBytes) {
  return stdoutFile.size() + stderrBytes > MAX_ANALYZER_OUTPUT_BYTES
    ? new Error(`${task.name} exceeded the analyzer output limit`)
    : undefined;
}

function settleClose(task, { failure, status, signal, stdoutFile, output }, { resolve, reject }) {
  const error = failure ?? outputFailure(task, stdoutFile, output.bytes());
  if (error !== undefined) {
    reject(error);
    return;
  }
  try {
    resolve(
      reportFromAnalyzerOutput(task, {
        status,
        signal,
        stdoutText: stdoutFile.read('utf8'),
        stderrText: Buffer.concat(output.stderr).toString('utf8'),
      }),
    );
  } catch (error) {
    reject(error);
  }
}

function spawnAnalyzer(task, stdoutDescriptor) {
  const child = spawn(task.invocation.command, task.invocation.args, {
    cwd: task.invocation.cwd,
    env: analyzerEnvironment(task.invocation.env ?? process.env),
    detached: process.platform !== 'win32',
    stdio: ['ignore', stdoutDescriptor, 'pipe'],
  });
  activeChildren.add(child);
  return child;
}

function createOutputCollector(onOverflow) {
  const stderr = [];
  let outputBytes = 0;
  function collectStderr(chunk) {
    outputBytes += chunk.length;
    if (outputBytes > MAX_ANALYZER_OUTPUT_BYTES) {
      onOverflow();
      return;
    }
    stderr.push(chunk);
  }
  return { stderr, collectStderr, bytes: () => outputBytes };
}

function scheduleForceKill(child) {
  const timer = setTimeout(() => {
    signalChildProcess(child, 'SIGKILL');
  }, FORCE_KILL_DELAY_MS);
  timer.unref();
  return timer;
}

function createTaskController(child, task) {
  const errors = new Map();
  const state = {
    settled: false,
    forceKillTimeout: undefined,
  };
  const timeout = setTimeout(() => {
    terminate(new Error(`${task.name} timed out after ${String(task.timeoutMs)} ms`));
  }, task.timeoutMs);
  function terminate(error) {
    if (errors.has('termination')) return;
    errors.set('termination', error);
    clearTimeout(timeout);
    signalChildProcess(child, 'SIGTERM');
    state.forceKillTimeout = scheduleForceKill(child);
  }
  function finish(operation) {
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
    recordError(error) {
      errors.set('child', error);
    },
  };
}

export function executeAnalyzerTask(task) {
  const stdoutFile = openOutputFile();
  return new Promise((resolve, reject) => {
    const child = spawnAnalyzer(task, stdoutFile.descriptor);
    const controller = createTaskController(child, task);
    const output = createOutputCollector(() => {
      controller.terminate(new Error(`${task.name} exceeded the analyzer output limit`));
    });
    child.stderr.on('data', output.collectStderr);
    child.on('error', (error) => {
      controller.recordError(error);
    });
    child.on('close', (status, signal) => {
      controller.finish(() => {
        settleClose(
          task,
          { failure: controller.error(), status, signal, stdoutFile, output },
          { resolve, reject },
        );
      });
    });
  }).finally(() => {
    stdoutFile.remove();
  });
}

export function reportFromAnalyzerOutput(task, { status, signal, stdoutText, stderrText }) {
  if (!task.acceptedExitCodes.includes(status)) {
    const exit = status === null ? `signal ${signal ?? 'unknown'}` : `exit ${String(status)}`;
    const detail = stderrText.trim() || stdoutText.trim() || 'no diagnostic output';
    throw new Error(`${task.name} crashed with ${exit}: ${detail}`);
  }
  return parseReport(stdoutText, task.name, task.reportedTools);
}

function signalChildProcess(child, signal) {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform !== 'win32' && signalProcessGroup(child.pid, signal)) return;
  try {
    child.kill(signal);
  } catch (error) {
    return { kind: 'signal-failed', error };
  }
}

export function installShutdownHandlers(
  shutdownController,
  { forceKillDelayMs = FORCE_KILL_DELAY_MS } = {},
) {
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
      }, forceKillDelayMs);
      forceKillTimeout.unref();
    });
  }
}

function parseReport(stdout, analyzerName, reportedTools = []) {
  let rawReport;
  try {
    rawReport = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${analyzerName} did not produce valid JSON`, { cause: error });
  }
  const report = parseAnalyzerReport(rawReport, analyzerName);
  const mismatchedFinding = report.findings.find(
    (finding) => finding.tool !== analyzerName && !reportedTools.includes(finding.tool),
  );
  if (mismatchedFinding !== undefined) {
    throw new Error(
      `${analyzerName} emitted a finding for unexpected tool ${mismatchedFinding.tool}`,
    );
  }
  return report;
}

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    return error?.code === 'ESRCH';
  }
}
