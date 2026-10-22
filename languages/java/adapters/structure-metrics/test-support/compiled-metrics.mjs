import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const HASH_LENGTH = 16;
const COMPILATION_TIMEOUT_MS = 30_000;
const METRICS_TIMEOUT_MS = 120_000;
const METRICS_SOURCE = path.resolve(import.meta.dirname, '../../../gradle/StructureMetrics.java');

function placeCompiled(staging, classes) {
  try {
    renameSync(staging, classes);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    if (!existsSync(classes)) {
      throw new Error(`could not place the compiled metrics at ${classes}`, { cause: error });
    }
  }
}

export function compiledMetrics() {
  const source = readFileSync(METRICS_SOURCE);
  const hash = createHash('sha256').update(source).digest('hex').slice(0, HASH_LENGTH);
  const classes = path.join(tmpdir(), `nitpicker-structure-metrics-${hash}`);
  if (existsSync(classes)) {
    return classes;
  }
  const staging = mkdtempSync(`${classes}-`);
  const compiled = spawnSync('javac', ['-d', staging, METRICS_SOURCE], {
    encoding: 'utf8',
    timeout: COMPILATION_TIMEOUT_MS,
  });
  if (compiled.status !== 0) {
    throw new Error(`javac failed: ${compiled.stderr}`);
  }
  placeCompiled(staging, classes);
  return classes;
}

export function runMetrics(classes, { cwd, args }) {
  const result = spawnSync('java', ['-cp', classes, 'StructureMetrics', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: METRICS_TIMEOUT_MS,
  });
  const stderr = result.stderr
    .split('\n')
    .filter((line) => !line.startsWith('Picked up '))
    .join('\n');
  return { status: result.status, stderr };
}
