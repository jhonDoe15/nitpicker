import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const JAVAC = 'javac';
const TIMEOUT_MS = 60_000;

export function javacAvailable(): boolean {
  return spawnSync(JAVAC, ['-version'], { timeout: TIMEOUT_MS }).status === 0;
}

export function compileStatus(source: string): number | undefined {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-javac-'));
  try {
    const file = path.join(root, 'Wide.java');
    writeFileSync(file, source);
    return (
      spawnSync(JAVAC, ['-d', root, file], { encoding: 'utf8', timeout: TIMEOUT_MS }).status ??
      undefined
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function compileFilesStatus(
  files: Readonly<Record<string, string>>,
): SpawnSyncReturns<string> {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-javac-'));
  try {
    const names = Object.entries(files).map(([name, source]) => {
      const file = path.join(root, path.basename(name));
      writeFileSync(file, source);
      return file;
    });
    return spawnSync(JAVAC, ['-d', root, ...names], { encoding: 'utf8', timeout: TIMEOUT_MS });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
