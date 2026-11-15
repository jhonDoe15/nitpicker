import {
  linkSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fieldOf } from '../../../shared/values/readers.mts';
import { trackTemporaryPath, untrackTemporaryPath } from '../temporary-files.mjs';

type BuildFiles = { result: string; failure: string; lock: string };
type Settled = { text: string; failure?: undefined } | { failure: string; text?: undefined };
type Build = () => string;
type Pause = (milliseconds: number) => void;
type BuildOnceOptions = { directory?: string | undefined; pause?: Pause };

const trackPath: (filePath: string) => string = trackTemporaryPath;
const untrackPath: (filePath: string) => void = untrackTemporaryPath;

export const SHARED_BUILD_DIRECTORY_ENVIRONMENT = 'NITPICKER_SHARED_BUILD_DIRECTORY';

const EMPTY_LOCK_GRACE_MS = 5000;
const MISSING_FILE = 'ENOENT';
const SEMAPHORE_BYTES = 4;
const POLL_STEP_MS = 25;
const MAX_POLL_INTERVAL_MS = 250;
const POLL_ATTEMPTS = Array.from({ length: 3000 }, (_, attempt) => attempt);

export class TransientBuildError extends Error {}

export function withSharedBuildDirectory<T>(
  operation: (environment: Record<string, string>) => T,
): T {
  const directory = trackPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-shared-')));
  try {
    return operation({ [SHARED_BUILD_DIRECTORY_ENVIRONMENT]: directory });
  } finally {
    rmSync(directory, { recursive: true, force: true });
    untrackPath(directory);
  }
}

export function buildOnce(
  key: string,
  build: Build,
  {
    directory = process.env[SHARED_BUILD_DIRECTORY_ENVIRONMENT],
    pause = sleep,
  }: BuildOnceOptions = {},
): string {
  if (directory === undefined || directory.length === 0) {
    return build();
  }
  return buildOrWait(
    {
      result: path.join(directory, `${key}.result`),
      failure: path.join(directory, `${key}.failure`),
      lock: path.join(directory, `${key}.lock`),
    },
    { build, pause },
  );
}

function buildOrWait(files: BuildFiles, { build, pause }: { build: Build; pause: Pause }): string {
  for (const attempt of POLL_ATTEMPTS) {
    const settled = readSettled(files);
    if (settled !== undefined) {
      return unwrap(settled);
    }
    if (acquireLock(files.lock)) {
      return buildLocked(files, build);
    }
    pause(Math.min(MAX_POLL_INTERVAL_MS, POLL_STEP_MS * (attempt + 1)));
  }
  throw new Error(`Timed out waiting for the shared build ${files.result}`);
}

function unwrap({ text, failure }: Settled): string {
  if (failure !== undefined) {
    throw new Error(failure);
  }
  return text;
}

function readSettled({ result, failure }: BuildFiles): Settled | undefined {
  const text = readIfPresent(result);
  if (text !== undefined) {
    return { text };
  }
  const message = readIfPresent(failure);
  return message === undefined ? undefined : { failure: message };
}

function buildLocked(files: BuildFiles, build: Build): string {
  try {
    const settled = readSettled(files);
    return settled === undefined ? buildAndRecord(files, build) : unwrap(settled);
  } finally {
    rmSync(files.lock, { force: true });
  }
}

function buildAndRecord({ result, failure }: BuildFiles, build: Build): string {
  try {
    const text = build();
    writeAtomically(result, text);
    return text;
  } catch (error) {
    if (!(error instanceof TransientBuildError)) {
      writeAtomically(failure, error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}

function acquireLock(lock: string): boolean {
  try {
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
    return true;
  } catch (error) {
    if (fieldOf(error, 'code') !== 'EEXIST') {
      throw error;
    }
    discardIfAbandoned(lock);
    return false;
  }
}

function discardIfAbandoned(lock: string): void {
  if (!isAbandoned(lock)) {
    return;
  }
  const claimed = `${lock}.${String(process.pid)}.stale`;
  try {
    renameSync(lock, claimed);
  } catch (error) {
    if (fieldOf(error, 'code') === MISSING_FILE) {
      return;
    }
    throw error;
  }
  if (isAbandoned(claimed)) {
    rmSync(claimed, { force: true });
  } else {
    restoreLock(claimed, lock);
  }
}

function restoreLock(claimed: string, lock: string): void {
  try {
    linkSync(claimed, lock);
  } catch (error) {
    if (fieldOf(error, 'code') !== 'EEXIST') {
      throw error;
    }
  }
  rmSync(claimed, { force: true });
}

function isAbandoned(file: string): boolean {
  const owner = readIfPresent(file);
  if (owner === undefined) {
    return false;
  }
  if (owner.length === 0) {
    return ageMilliseconds(file) > EMPTY_LOCK_GRACE_MS;
  }
  return !isRunning(Number(owner));
}

function ageMilliseconds(file: string): number {
  try {
    return Date.now() - statSync(file).mtimeMs;
  } catch (error) {
    if (fieldOf(error, 'code') === MISSING_FILE) {
      return 0;
    }
    throw error;
  }
}

function isRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid < 1) {
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return fieldOf(error, 'code') !== 'ESRCH';
  }
}

function writeAtomically(file: string, text: string): void {
  const pending = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(pending, text);
  renameSync(pending, file);
}

function readIfPresent(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (fieldOf(error, 'code') === MISSING_FILE) {
      return undefined;
    }
    throw error;
  }
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(SEMAPHORE_BYTES)), 0, 0, milliseconds);
}
