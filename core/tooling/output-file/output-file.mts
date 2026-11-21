import { spawnSync } from 'node:child_process';
import type {
  SpawnSyncOptions,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
  StdioOptions,
} from 'node:child_process';
import { closeSync, fstatSync, mkdtempSync, openSync, readSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getSystemErrorMap } from 'node:util';
import { parseJsonDescriptor } from '../../../shared/report-output/pieces/json-lines.mts';
import { trackTemporaryPath, untrackTemporaryPath } from '../temporary-files.mts';

const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: 3, retryDelay: 100 };
const DEFAULT_MAX_BUFFER = 1024 * 1024;
const ENOBUFS_ERRNO = [...getSystemErrorMap()].find(([, [name]]) => name === 'ENOBUFS')?.[0];

type ReadEncoding = SpawnSyncOptions['encoding'];
type Parsed = { readonly value: unknown } | { readonly error: unknown };
type CaptureOptions = {
  readonly file: OutputFile;
  readonly encoding: ReadEncoding;
  readonly maxBuffer: number;
  readonly parse?: boolean;
};
type OutputFile = {
  readonly directory: string;
  readonly descriptor: number;
  readonly size: () => number;
  readonly read: (encoding?: ReadEncoding, limit?: number) => Buffer | string;
  readonly remove: () => void;
};

class OutputLimitError extends Error {
  code = 'ENOBUFS';
  errno = ENOBUFS_ERRNO;
  syscall: string;
  path: string;
  spawnargs: readonly string[];

  constructor(command: string, args: readonly string[]) {
    super(`spawnSync ${command} ENOBUFS`);
    this.syscall = `spawnSync ${command}`;
    this.path = command;
    this.spawnargs = args;
  }
}

function removeDirectory(directory: string): { removed: boolean; error?: unknown } {
  try {
    rmSync(directory, REMOVE_OPTIONS);
    untrackTemporaryPath(directory);
    return { removed: true };
  } catch (error) {
    return { removed: false, error };
  }
}

function readDescriptor(descriptor: number, limit: number): Buffer {
  const buffer = Buffer.alloc(Math.min(fstatSync(descriptor).size, limit));
  const read = buffer.length === 0 ? 0 : readSync(descriptor, buffer, 0, buffer.length, 0);
  return buffer.subarray(0, read);
}

export function openOutputFile(): OutputFile {
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
      return encoding === undefined || encoding === 'buffer'
        ? buffer
        : buffer.toString(encoding ?? undefined);
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

function stdioWith(stdio: StdioOptions = 'pipe', descriptor: number): StdioOptions {
  const streams = typeof stdio === 'string' ? [stdio, stdio, stdio] : [...stdio];
  streams[1] = descriptor;
  return streams;
}

function capturedStdout(
  {
    command,
    args,
    result,
  }: { command: string; args: readonly string[]; result: SpawnSyncReturns<string | Buffer> },
  { file, encoding, maxBuffer, parse }: CaptureOptions,
): { stdout: string | Buffer; error?: Error; parsed?: Parsed } {
  if (file.size() > maxBuffer) {
    const stdout = file.read(encoding, maxBuffer);
    return { stdout, error: result.error ?? new OutputLimitError(command, args) };
  }
  if (parse && result.status === 0 && result.error === undefined) {
    return { stdout: '', parsed: parsedOutput(file) };
  }
  return { stdout: file.read(encoding) };
}

function parsedOutput(file: OutputFile): Parsed {
  try {
    return { value: parseJsonDescriptor(file.descriptor, () => String(file.read('utf8'))) };
  } catch (error) {
    return { error };
  }
}

export function spawnSyncParsingOutput(
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
): SpawnSyncReturns<string> & { readonly parsed?: Parsed } {
  const file = openOutputFile();
  try {
    const { maxBuffer = DEFAULT_MAX_BUFFER, encoding, stdio } = options;
    const result = spawnSync(command, args, {
      ...options,
      stdio: stdioWith(stdio, file.descriptor),
    });
    const captured = capturedStdout(
      { command, args, result },
      { file, encoding, maxBuffer, parse: true },
    );
    return { ...result, ...captured, stdout: String(captured.stdout) };
  } finally {
    file.remove();
  }
}

export function spawnSyncWithOutputFile(
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
): SpawnSyncReturns<string>;
export function spawnSyncWithOutputFile(
  command: string,
  args: readonly string[],
  options?: SpawnSyncOptions,
): SpawnSyncReturns<string | Buffer>;
export function spawnSyncWithOutputFile(
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions = {},
): SpawnSyncReturns<string | Buffer> {
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
    return {
      ...result,
      ...captured,
      output: [...result.output.slice(0, 1), captured.stdout, result.stderr],
    };
  } finally {
    file.remove();
  }
}
