import { spawn } from 'node:child_process';
import { openOutputFile } from '../../tooling/output-file.mjs';
import { parseAnalyzerReport } from '../comparison/finding-schema.mjs';

const MAX_ANALYZER_OUTPUT_BYTES = 50 * 1024 * 1024;

const FORCE_KILL_DELAY_MS = 1_000;

const OUTPUT_POLL_INTERVAL_MS = 100;

const activeChildren = new Set();

const HOST_CI_OUTPUT_VARIABLES = ['GITHUB_STEP_SUMMARY'];

function analyzerEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !HOST_CI_OUTPUT_VARIABLES.includes(name)),
  );
}

function outputLimitError(task) {
  return new Error(`${task.name} exceeded the analyzer output limit`);
}

function settleClose(task, { failure, status, signal, stdoutFile, output }, { resolve, reject }) {
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

function createOutputCollector(stdoutFile, onOverflow) {
  const stderr = [];
  const state = { stderrBytes: 0 };
  function exceeded() {
    return stdoutFile.size() + state.stderrBytes > MAX_ANALYZER_OUTPUT_BYTES;
  }
  function check() {
    if (exceeded()) {
      onOverflow();
    }
  }
  function collectStderr(chunk) {
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
    stop() {
      clearInterval(poll);
    },
  };
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

export async function executeAnalyzerTask(task) {
  const stdoutFile = openOutputFile();
  try {
    return await runAnalyzerChild(task, stdoutFile);
  } finally {
    stdoutFile.remove();
  }
}

function runAnalyzerChild(task, stdoutFile) {
  return new Promise((resolve, reject) => {
    const child = spawnAnalyzer(task, stdoutFile.descriptor);
    const controller = createTaskController(child, task);
    const output = createOutputCollector(stdoutFile, () => {
      controller.terminate(outputLimitError(task));
    });
    child.stderr.on('data', output.collectStderr);
    child.on('error', (error) => {
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
