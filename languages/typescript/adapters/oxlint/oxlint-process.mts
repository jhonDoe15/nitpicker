import { type SpawnSyncReturns, spawn } from 'node:child_process';
import { spawnSyncWithOutputFile, toolBinaryPath } from '../typed/tooling.mts';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../../shared/config.mjs';
import { TROUBLESHOOTING_ANCHORS } from '../../../../shared/messages/troubleshooting.mjs';
import { troubleshootingError, withTroubleshooting } from '../lint-engine/typed/tools.mts';
import { INCOMPATIBLE_MARKER } from '../lint-engine/compatibility/incompatible-package.mts';
import { parseJson } from '../../../../shared/values/readers.mts';
import type { Environment } from '../../../../shared/processes/environment.mts';

type Status = SpawnSyncReturns<string>['status'];

export type CollectedRun = {
  readonly status: Status;
  readonly error: (Error & { readonly code?: unknown }) | undefined;
  readonly stdout: string;
  readonly stderr: string;
};

type JsonRun = {
  readonly cwd: string;
  readonly env: Environment | undefined;
  readonly context: string;
  readonly timeoutMs: number;
  readonly acceptedStatuses?: readonly Status[];
};

type CollectedOutput = {
  readonly stdout: Buffer[];
  readonly stderr: Buffer[];
  collect(chunks: Buffer[]): (chunk: Buffer) => void;
};

const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const MAX_INVALID_OUTPUT_CHARACTERS = 2000;
const ENGINE_HINT =
  'Set "tools": { "eslint": { "engine": "eslint" } } in nitpicker.config.json to lint with ESLint instead.';

export function oxlintBinary(): string {
  return toolBinaryPath('oxlint', { bin: 'bin/oxlint' });
}

export function tsgolintBinary(): string {
  const packageRoot = path.dirname(toolBinaryPath('oxlint-tsgolint', { bin: 'package.json' }));
  const executable = process.platform === 'win32' ? 'tsgolint.exe' : 'tsgolint';
  const platformPackage = `@oxlint-tsgolint/${process.platform}-${process.arch}`;
  try {
    return createRequire(path.join(packageRoot, 'package.json')).resolve(
      `${platformPackage}/${executable}`,
    );
  } catch (error) {
    throw troubleshootingError(
      `The type-aware lint rules need ${platformPackage}, which is not installed. ${ENGINE_HINT}`,
      TROUBLESHOOTING_ANCHORS.engineUnavailable,
      { cause: error },
    );
  }
}

export function withEngineHint(detail: string): string {
  if (detail.includes(INCOMPATIBLE_MARKER)) {
    return detail;
  }
  return detail.includes(CONFIG_FILE_NAME)
    ? detail
    : withTroubleshooting(`${detail}\n${ENGINE_HINT}`, TROUBLESHOOTING_ANCHORS.engineUnavailable);
}

export function withCompileCache(environment: Environment | undefined): Environment {
  return {
    NODE_COMPILE_CACHE: path.join(tmpdir(), 'nitpicker-node-compile-cache'),
    ...environment,
  };
}

export function spawnJson(
  argumentList: readonly string[],
  { cwd, env, context, timeoutMs, acceptedStatuses = [0] }: JsonRun,
): unknown {
  const result = spawnSyncWithOutputFile(process.execPath, argumentList, {
    cwd,
    env: withCompileCache(env),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: timeoutMs,
  });
  return parsedReport(result, { context, acceptedStatuses });
}

export async function spawnJsonAsync(
  argumentList: readonly string[],
  { cwd, env, context, timeoutMs, acceptedStatuses = [0] }: JsonRun,
): Promise<unknown> {
  const result = await spawnCollected(process.execPath, argumentList, {
    cwd,
    env: withCompileCache(env),
    maxBuffer: MAX_OUTPUT_BYTES,
    timeoutMs,
  });
  return parsedReport(result, { context, acceptedStatuses });
}

export function spawnCollected(
  command: string,
  argumentList: readonly string[],
  {
    cwd,
    env,
    maxBuffer,
    timeoutMs,
  }: {
    readonly cwd: string;
    readonly env: Environment;
    readonly maxBuffer: number;
    readonly timeoutMs: number | undefined;
  },
): Promise<CollectedRun> {
  return new Promise((resolve) => {
    const child = spawn(command, argumentList, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const failures: (Error & { readonly code?: unknown })[] = [];
    function stop(code: string): void {
      if (child.killed) {
        return;
      }
      failures.push(Object.assign(new Error(`spawn ${command} ${code}`), { code }));
      child.kill('SIGTERM');
    }
    const output = outputCollector(maxBuffer, () => {
      stop('ENOBUFS');
    });
    const timer = deadline(timeoutMs, () => {
      stop('ETIMEDOUT');
    });
    child.stdout.on('data', output.collect(output.stdout));
    child.stderr.on('data', output.collect(output.stderr));
    child.on('error', (error) => {
      failures.push(error);
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({
        status,
        error: failures[0],
        stdout: Buffer.concat(output.stdout).toString('utf8'),
        stderr: Buffer.concat(output.stderr).toString('utf8'),
      });
    });
  });
}

function deadline(
  timeoutMs: number | undefined,
  onTimeout: () => void,
): NodeJS.Timeout | undefined {
  return timeoutMs === undefined
    ? undefined
    : setTimeout(() => {
        onTimeout();
      }, timeoutMs);
}

function outputCollector(maxBuffer: number, onOverflow: () => void): CollectedOutput {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  function collect(chunks: Buffer[]): (chunk: Buffer) => void {
    let bytes = 0;
    return (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBuffer) {
        onOverflow();
      } else {
        chunks.push(chunk);
      }
    };
  }
  return { stdout, stderr, collect };
}

function parsedReport(
  result: Pick<CollectedRun, 'status' | 'stdout' | 'stderr'> & {
    readonly error?: Error | undefined;
  },
  {
    context,
    acceptedStatuses,
  }: { readonly context: string; readonly acceptedStatuses: readonly Status[] },
): unknown {
  if (result.error !== undefined) {
    throw new Error(`${context} failed: ${result.error.message}`, { cause: result.error });
  }
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${context} exited with ${String(result.status)}: ${withEngineHint(detail)}`);
  }
  try {
    return parseJson(result.stdout);
  } catch (error) {
    const detail = (result.stderr.trim() || result.stdout).slice(0, MAX_INVALID_OUTPUT_CHARACTERS);
    throw new Error(`${context} did not produce valid JSON: ${detail}`, { cause: error });
  }
}
