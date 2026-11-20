import { spawn, spawnSync } from 'node:child_process';
import { findEngine } from './engine-binary.mts';

export type EngineRun = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

export type EngineOptions = {
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly binary?: string | undefined;
};

const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const NOT_FOUND: EngineRun = {
  status: null,
  stdout: '',
  stderr: 'nitpicker-engine is not available for this platform',
};

function notStarted(error: Error): EngineRun {
  return { status: null, stdout: '', stderr: error.message };
}

export function runEngineSync(
  argumentList: readonly string[],
  options: EngineOptions = {},
): EngineRun {
  const binary = options.binary ?? findEngine();
  if (binary === undefined) {
    return NOT_FOUND;
  }
  const result = spawnSync(binary, argumentList, {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.error === undefined
    ? { status: result.status, stdout: result.stdout, stderr: result.stderr }
    : notStarted(result.error);
}

export function runEngine(
  argumentList: readonly string[],
  options: EngineOptions = {},
): Promise<EngineRun> {
  const binary = options.binary ?? findEngine();
  if (binary === undefined) {
    return Promise.resolve(NOT_FOUND);
  }
  return new Promise((resolve) => {
    const child = spawn(binary, argumentList, {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      resolve(notStarted(error));
    });
    child.on('close', (status) => {
      resolve({
        status,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}
