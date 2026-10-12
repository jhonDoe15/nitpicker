import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const SHARED_BUILD_DIRECTORY_ENVIRONMENT = 'NITPICKER_SHARED_BUILD_DIRECTORY';

const POLL_STEP_MS = 25;
const MAX_POLL_INTERVAL_MS = 250;
const POLL_ATTEMPTS = Array.from({ length: 3000 }, (_, attempt) => attempt);

export function withSharedBuildDirectory(operation) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-shared-'));
  try {
    return operation({ [SHARED_BUILD_DIRECTORY_ENVIRONMENT]: directory });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function buildOnce(
  key,
  build,
  { directory = process.env[SHARED_BUILD_DIRECTORY_ENVIRONMENT], pause = sleep } = {},
) {
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

function buildOrWait(files, { build, pause }) {
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

function unwrap({ text, failure }) {
  if (failure !== undefined) {
    throw new Error(failure);
  }
  return text;
}

function readSettled({ result, failure }) {
  const text = readIfPresent(result);
  if (text !== undefined) {
    return { text };
  }
  const message = readIfPresent(failure);
  return message === undefined ? undefined : { failure: message };
}

function buildLocked({ result, failure, lock }, build) {
  try {
    const text = build();
    writeAtomically(result, text);
    return text;
  } catch (error) {
    writeAtomically(failure, error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    rmSync(lock, { force: true });
  }
}

function acquireLock(lock) {
  try {
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
    removeIfAbandoned(lock);
    return false;
  }
}

function removeIfAbandoned(lock) {
  const owner = readIfPresent(lock);
  if (owner !== undefined && owner.length > 0 && !isRunning(Number(owner))) {
    rmSync(lock, { force: true });
  }
}

function isRunning(pid) {
  if (!Number.isInteger(pid) || pid < 1) {
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function writeAtomically(file, text) {
  const pending = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(pending, text);
  renameSync(pending, file);
}

function readIfPresent(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
