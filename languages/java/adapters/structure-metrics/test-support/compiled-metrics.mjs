import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const METRICS_SOURCE = path.resolve(
  import.meta.dirname,
  '../../../gradle/StructureMetrics.java',
);

export function compiledMetrics() {
  const source = readFileSync(METRICS_SOURCE);
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
  const classes = path.join(tmpdir(), `nitpicker-structure-metrics-${hash}`);
  if (!existsSync(classes)) {
    const staging = mkdtempSync(`${classes}-`);
    const compiled = spawnSync('javac', ['-d', staging, METRICS_SOURCE], { encoding: 'utf8' });
    if (compiled.status !== 0) {
      throw new Error(`javac failed: ${compiled.stderr}`);
    }
    try {
      renameSync(staging, classes);
    } catch {
      rmSync(staging, { recursive: true, force: true });
    }
  }
  return classes;
}

export function runMetrics(classes, { cwd, args }) {
  const result = spawnSync('java', ['-cp', classes, 'StructureMetrics', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const stderr = result.stderr
    .split('\n')
    .filter((line) => !line.startsWith('Picked up '))
    .join('\n');
  return { status: result.status, stderr };
}
