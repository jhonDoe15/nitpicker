import { spawn } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeReusePart } from './reuse-ahead.mts';
import {
  HEARTBEAT_FILE,
  HEARTBEAT_MS,
  REQUEST_FILE,
  RESULT_FILE,
  STATUS_FILE,
} from './reuse-files.mts';
import { sourceStamps } from './reuse-request.mts';

const COMPUTE = 'compute';

function writeWhole(file: string, value: unknown): void {
  const partial = `${file}.partial`;
  writeFileSync(partial, JSON.stringify(value));
  renameSync(partial, file);
}

function compute(folder: string): void {
  const request = readFileSync(path.join(folder, REQUEST_FILE), 'utf8');
  const stamps = sourceStamps(request);
  writeWhole(path.join(folder, RESULT_FILE), { stamps, part: computeReusePart(request) });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

function supervise(parent: number, folder: string): void {
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), String(parent), folder, COMPUTE],
    { stdio: 'ignore' },
  );
  const beat = path.join(folder, HEARTBEAT_FILE);
  function stopChild(): void {
    child.kill();
    process.exit(1);
  }
  function heartbeat(): void {
    try {
      writeFileSync(beat, '');
    } catch (error) {
      child.kill();
      throw new Error('The folder of the reuse facts run is gone', { cause: error });
    }
  }
  heartbeat();
  const watch = setInterval(() => {
    if (!isAlive(parent)) {
      stopChild();
    }
    heartbeat();
  }, HEARTBEAT_MS);
  function finish(code: number | null): void {
    clearInterval(watch);
    writeWhole(path.join(folder, STATUS_FILE), { code });
  }
  child.on('error', () => {
    finish(null);
  });
  child.on('exit', finish);
  process.on('SIGTERM', stopChild);
}

const [parent = '0', folder = '', mode] = process.argv.slice(2);
if (mode === COMPUTE) {
  compute(folder);
} else {
  supervise(Number(parent), folder);
}
