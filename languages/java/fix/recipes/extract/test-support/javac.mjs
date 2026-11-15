import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TIMEOUT_MS = 60_000;

export function javacAvailable() {
  return spawnSync('javac', ['-version'], { timeout: TIMEOUT_MS }).status === 0;
}

export function compileStatus(source) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-javac-'));
  try {
    const file = path.join(root, 'Wide.java');
    writeFileSync(file, source);
    return spawnSync('javac', ['-d', root, file], { encoding: 'utf8', timeout: TIMEOUT_MS }).status;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
