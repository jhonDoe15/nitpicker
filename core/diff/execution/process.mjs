import { spawn } from 'node:child_process';
import { parseAnalyzerReport } from '../comparison/finding-schema.mjs';
import {
  ANALYZER_TIMEOUT_KEY,
  ANALYZER_TIMEOUT_VARIABLE,
} from '../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';

const MAX_ANALYZER_OUTPUT_BYTES = 50 * 1024 * 1024;

const FORCE_KILL_DELAY_MS = 1_000;

const activeChildren = new Set();

const HOST_CI_OUTPUT_VARIABLES = ['GITHUB_STEP_SUMMARY'];

function analyzerEnvironment(environment, task) {
  return Object.fromEntries([
    ...Object.entries(environment).filter(([name]) => !HOST_CI_OUTPUT_VARIABLES.includes(name)),
    ...(task.configuredTimeout === true
      ? [[ANALYZER_TIMEOUT_VARIABLE, String(task.timeoutMs)]]
      : []),
  ]);
}

function settleClose(task, { failure, status, signal, stdout, stderr }, { resolve, reject }) {
  if (failure !== undefined) {
    reject(failure);
    return;
  }
  try {
    resolve(
      reportFromAnalyzerOutput(task, {
        status,
        signal,
        stdoutText: Buffer.concat(stdout).toString('utf8'),
        stderrText: Buffer.concat(stderr).toString('utf8'),
      }),
    );
  } catch (error) {
    reject(error);
  }
}

function spawnAnalyzer(task) {
  const child = spawn(task.invocation.command, task.invocation.args, {
    cwd: task.invocation.cwd,
    env: analyzerEnvironment(task.invocation.env ?? process.env, task),
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeChildren.add(child);
  return child;
}

function createOutputCollector(onOverflow) {
  const stdout = [];
  const stderr = [];
  let outputBytes = 0;
  function collect(chunks) {
    return (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_ANALYZER_OUTPUT_BYTES) {
        onOverflow();
        return;
      }
      chunks.push(chunk);
    };
  }
  return { stdout, stderr, collectStdout: collect(stdout), collectStderr: collect(stderr) };
}

function scheduleForceKill(child) {
  const timer = setTimeout(() => {
    signalChildProcess(child, 'SIGKILL');
  }, FORCE_KILL_DELAY_MS);
  timer.unref();
  return timer;
}

function timeoutMessage(task) {
  return (
    `${task.name} timed out after ${String(task.timeoutMs)} ms. To give it more time, set ` +
    `"${ANALYZER_TIMEOUT_KEY}": { "${task.name}": <minutes> } in ${CONFIG_FILE_NAME}`
  );
}

function createTaskController(child, task) {
  const errors = new Map();
  const state = {
    settled: false,
    forceKillTimeout: undefined,
  };
  const timeout = setTimeout(() => {
    terminate(new Error(timeoutMessage(task)));
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
  return new Promise((resolve, reject) => {
    const child = spawnAnalyzer(task);
    const controller = createTaskController(child, task);
    const output = createOutputCollector(() => {
      controller.terminate(new Error(`${task.name} exceeded the analyzer output limit`));
    });
    child.stdout.on('data', output.collectStdout);
    child.stderr.on('data', output.collectStderr);
    child.on('error', (error) => {
      controller.recordError(error);
    });
    child.on('close', (status, signal) => {
      controller.finish(() => {
        settleClose(
          task,
          {
            failure: controller.error(),
            status,
            signal,
            ...output,
          },
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
