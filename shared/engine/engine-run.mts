import { execFile, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export type EngineRun = {
  readonly status: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
};

export type EngineOptions = {
  readonly binary: string | undefined;
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
};

export type EngineEnvironment = Readonly<Record<string, string | undefined>>;
export type EngineStart = (
  argumentList: readonly string[],
  options: { readonly binary: string; readonly environment: EngineEnvironment },
) => EngineRun;
export type EngineLog = { write(text: string): unknown };
export type EngineHooks = { readonly run?: EngineStart; readonly log?: EngineLog };
export type EngineCall = {
  readonly binary: string;
  readonly environment: EngineEnvironment;
  readonly run: EngineStart;
};

const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const NOT_FOUND: EngineRun = {
  status: undefined,
  stdout: '',
  stderr: 'nitpicker-engine is not available for this platform',
};

function notStarted(error: Error): EngineRun {
  return { status: undefined, stdout: '', stderr: error.message };
}

export function runEngineSync(
  argumentList: readonly string[],
  { binary, cwd, timeoutMs, environment }: EngineOptions,
): EngineRun {
  if (binary === undefined) {
    return NOT_FOUND;
  }
  const result = spawnSync(binary, argumentList, {
    cwd,
    ...(environment === undefined ? {} : { env: environment }),
    timeout: timeoutMs,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.error === undefined
    ? { status: result.status ?? undefined, stdout: result.stdout, stderr: result.stderr }
    : notStarted(result.error);
}

export function runEngine(
  argumentList: readonly string[],
  { binary, cwd, timeoutMs }: EngineOptions,
): Promise<EngineRun> {
  if (binary === undefined) {
    return Promise.resolve(NOT_FOUND);
  }
  return new Promise((resolve) => {
    execFile(
      binary,
      [...argumentList],
      { cwd, timeout: timeoutMs, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ status: 0, stdout, stderr });
        } else if (typeof error.code === 'number') {
          resolve({ status: error.code, stdout, stderr });
        } else {
          resolve(notStarted(error));
        }
      },
    );
  });
}

export function writtenFile(file: string, text: string): string {
  writeFileSync(file, text);
  return file;
}
