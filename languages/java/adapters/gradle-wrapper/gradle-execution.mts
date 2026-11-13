import { type ChildProcess, type SpawnOptions, spawn, spawnSync } from 'node:child_process';
import type { Readable } from 'node:stream';

type GradleChild = ChildProcess & { readonly stdout: Readable; readonly stderr: Readable };
type ExitStatus = ChildProcess['exitCode'];
type ExitSignal = ChildProcess['signalCode'];
type ExecutionError = { readonly message: string; readonly code: string | undefined };
type ErrorSlot = 'termination' | 'child' | 'signal';
type ExecutionState = {
  readonly errors: Map<ErrorSlot, ExecutionError>;
  termination: NodeJS.Timeout | undefined;
  settled: boolean;
};
type Finish = (status: ExitStatus, signal: ExitSignal) => void;
type Terminate = (error: ExecutionError) => void;
type ExecutionResult = {
  readonly status: ExitStatus;
  readonly signal: ExitSignal;
  readonly error: ExecutionError | undefined;
};
type GradleOptions = SpawnOptions & { readonly timeout: number; readonly maxBuffer: number };
export type GradleInvocation = {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: GradleOptions;
};
export type GradleOutcome = ExecutionResult & { readonly stdout: string; readonly stderr: string };

const GRACE_MS = 500;
const REAP_MS = 1_000;

function codeOf(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function signalGroup(
  child: GradleChild,
  signal: NodeJS.Signals,
  errors: ExecutionState['errors'],
): void {
  if (child.pid === undefined) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    const code = codeOf(error);
    if (code !== 'ESRCH') {
      errors.set('signal', { message: messageOf(error), code });
    }
  }
}

function forceStop(child: GradleChild, state: ExecutionState, finish: Finish): void {
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      timeout: REAP_MS,
    });
    if (result.error !== undefined) {
      child.kill('SIGKILL');
    }
  } else {
    signalGroup(child, 'SIGKILL', state.errors);
  }
  state.termination = setTimeout(() => {
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    finish(child.exitCode, child.signalCode);
  }, REAP_MS);
}

function createController(
  child: GradleChild,
  { command, timeout }: { readonly command: string; readonly timeout: number },
  resolve: (result: ExecutionResult) => void,
): { readonly terminate: Terminate } {
  const state: ExecutionState = { errors: new Map(), termination: undefined, settled: false };
  const deadline = setTimeout(() => {
    terminate({ message: `spawnSync ${command} ETIMEDOUT`, code: 'ETIMEDOUT' });
  }, timeout);
  function finish(status: ExitStatus, signal: ExitSignal): void {
    if (state.settled) {
      return;
    }
    state.settled = true;
    clearTimeout(deadline);
    clearTimeout(state.termination);
    for (const [signal, handler] of handlers) {
      process.removeListener(signal, handler);
    }
    resolve({ status, signal, error: errorOf(state.errors) });
  }
  function terminate(error: ExecutionError): void {
    if (state.errors.has('termination')) {
      return;
    }
    state.errors.set('termination', error);
    clearTimeout(deadline);
    stopTree(child, state, finish);
  }
  child.on('error', (error) => {
    const code = codeOf(error);
    state.errors.set('child', { message: `spawnSync ${command} ${String(code)}`, code });
  });
  child.on('close', (status, signal) => {
    if (state.errors.has('termination') && process.platform !== 'win32') {
      signalGroup(child, 'SIGKILL', state.errors);
    }
    finish(status, signal);
  });
  const handlers = shutdownHandlers(terminate);
  return { terminate };
}

function errorOf(errors: ExecutionState['errors']): ExecutionError | undefined {
  return errors.get('termination') ?? errors.get('child') ?? errors.get('signal');
}

function stopTree(child: GradleChild, state: ExecutionState, finish: Finish): void {
  if (process.platform === 'win32') {
    forceStop(child, state, finish);
  } else {
    signalGroup(child, 'SIGTERM', state.errors);
    state.termination = setTimeout(() => {
      forceStop(child, state, finish);
    }, GRACE_MS);
  }
}

function shutdownHandlers(terminate: Terminate): [NodeJS.Signals, () => void][] {
  return (['SIGINT', 'SIGTERM'] as const).map((signal): [NodeJS.Signals, () => void] => {
    function handler(): void {
      terminate({ message: `Gradle interrupted by ${signal}`, code: 'EINTR' });
    }
    process.on(signal, handler);
    return [signal, handler];
  });
}

type CollectedOutput = { readonly stdout: Buffer[]; readonly stderr: Buffer[]; bytes: number };

function collectOutput(
  child: GradleChild,
  maxBuffer: number,
  terminate: Terminate,
): CollectedOutput {
  const output: CollectedOutput = { stdout: [], stderr: [], bytes: 0 };
  function collect(stream: 'stdout' | 'stderr'): (chunk: Buffer) => void {
    return (chunk) => {
      output.bytes += chunk.length;
      if (output.bytes > maxBuffer) {
        terminate({ message: 'Gradle output exceeded maxBuffer (ENOBUFS)', code: 'ENOBUFS' });
        return;
      }
      output[stream].push(chunk);
    };
  }
  child.stdout.on('data', collect('stdout'));
  child.stderr.on('data', collect('stderr'));
  return output;
}

export function executeGradle({
  command,
  args,
  options,
}: GradleInvocation): Promise<GradleOutcome> {
  const { timeout, maxBuffer, ...launchOptions } = options;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...launchOptions,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const controller = createController(child, { command, timeout }, (result) => {
      resolve({
        ...result,
        stdout: Buffer.concat(output.stdout).toString('utf8'),
        stderr: Buffer.concat(output.stderr).toString('utf8'),
      });
    });
    const output = collectOutput(child, maxBuffer, controller.terminate);
  });
}
