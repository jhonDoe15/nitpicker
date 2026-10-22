import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: 3, retryDelay: 100 };

export class OutputLimitError extends Error {
  code = 'ENOBUFS';
}

export function openOutputFile() {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-output-'));
  const file = path.join(directory, 'stdout');
  const descriptor = openSync(file, 'w');
  const state = { open: true };
  return {
    descriptor,
    size: () => statSync(file).size,
    read: (encoding) => readFileSync(file, encoding === 'buffer' ? undefined : encoding),
    remove() {
      if (state.open) closeSync(descriptor);
      state.open = false;
      rmSync(directory, REMOVE_OPTIONS);
    },
  };
}

function stdioWith(stdio = 'pipe', descriptor) {
  const streams = typeof stdio === 'string' ? [stdio, stdio, stdio] : [...stdio];
  streams[1] = descriptor;
  return streams;
}

function capturedStdout(command, result, { file, encoding, maxBuffer }) {
  if (maxBuffer !== undefined && file.size() > maxBuffer) {
    const error = new OutputLimitError(`spawnSync ${command} ENOBUFS`);
    const empty = encoding === undefined || encoding === 'buffer' ? Buffer.alloc(0) : '';
    return { stdout: empty, error: result.error ?? error };
  }
  return { stdout: file.read(encoding) };
}

export function spawnSyncWithOutputFile(command, args, options = {}) {
  const file = openOutputFile();
  try {
    const { maxBuffer, encoding, stdio } = options;
    const result = spawnSync(command, args, {
      ...options,
      stdio: stdioWith(stdio, file.descriptor),
    });
    const captured = capturedStdout(command, result, { file, encoding, maxBuffer });
    return {
      ...result,
      ...captured,
      output: [result.output?.[0] ?? null, captured.stdout, ...(result.output?.slice(2) ?? [])],
    };
  } finally {
    file.remove();
  }
}
