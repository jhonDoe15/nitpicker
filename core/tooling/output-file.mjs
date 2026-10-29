import { spawnSync } from 'node:child_process';
import { closeSync, fstatSync, mkdtempSync, openSync, readSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getSystemErrorMap } from 'node:util';
import { trackTemporaryPath, untrackTemporaryPath } from './temporary-files.mjs';

const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: 3, retryDelay: 100 };
const DEFAULT_MAX_BUFFER = 1024 * 1024;
const ENOBUFS_ERRNO = [...getSystemErrorMap()].find(([, [name]]) => name === 'ENOBUFS')?.[0];

class OutputLimitError extends Error {
  code = 'ENOBUFS';
  errno = ENOBUFS_ERRNO;

  constructor(command, args) {
    super(`spawnSync ${command} ENOBUFS`);
    this.syscall = `spawnSync ${command}`;
    this.path = command;
    this.spawnargs = args;
  }
}

function removeDirectory(directory) {
  try {
    rmSync(directory, REMOVE_OPTIONS);
    untrackTemporaryPath(directory);
    return { removed: true };
  } catch (error) {
    return { removed: false, error };
  }
}

function readDescriptor(descriptor, limit) {
  const buffer = Buffer.alloc(Math.min(fstatSync(descriptor).size, limit));
  const read = buffer.length === 0 ? 0 : readSync(descriptor, buffer, 0, buffer.length, 0);
  return buffer.subarray(0, read);
}

export function openOutputFile() {
  const directory = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-output-')));
  const descriptor = openSync(path.join(directory, 'stdout'), 'w+');
  const state = { open: true };
  if (process.platform !== 'win32') {
    removeDirectory(directory);
  }
  return {
    directory,
    descriptor,
    size: () => fstatSync(descriptor).size,
    read(encoding, limit = Number.POSITIVE_INFINITY) {
      const buffer = readDescriptor(descriptor, limit);
      return encoding === undefined || encoding === 'buffer' ? buffer : buffer.toString(encoding);
    },
    remove() {
      if (state.open) {
        closeSync(descriptor);
      }
      state.open = false;
      removeDirectory(directory);
    },
  };
}

function stdioWith(stdio = 'pipe', descriptor) {
  const streams = typeof stdio === 'string' ? [stdio, stdio, stdio] : [...stdio];
  streams[1] = descriptor;
  return streams;
}

function capturedStdout({ command, args, result }, { file, encoding, maxBuffer }) {
  if (file.size() > maxBuffer) {
    const stdout = file.read(encoding, maxBuffer);
    return { stdout, error: result.error ?? new OutputLimitError(command, args) };
  }
  return { stdout: file.read(encoding) };
}

export function spawnSyncWithOutputFile(command, args, options = {}) {
  const file = openOutputFile();
  try {
    const { maxBuffer = DEFAULT_MAX_BUFFER, encoding, stdio } = options;
    const result = spawnSync(command, args, {
      ...options,
      stdio: stdioWith(stdio, file.descriptor),
    });
    if (!Array.isArray(result.output)) {
      return result;
    }
    const captured = capturedStdout({ command, args, result }, { file, encoding, maxBuffer });
    return { ...result, ...captured, output: [result.output[0], captured.stdout, result.stderr] };
  } finally {
    file.remove();
  }
}
