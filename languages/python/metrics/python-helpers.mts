import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PROBE_TIMEOUT_MS, TOOL_TIMEOUT_MS } from '../../../shared/processes/deadlines.mjs';

type MetricEntry = {
  file: string;
  name: string;
  start: number;
  end: number;
  lines: number;
  statements: number;
  maxControlNesting: number;
  parameters: number;
  complexity: number;
  [field: string]: unknown;
};

const parseMetrics: (text: string) => MetricEntry[] = JSON.parse;

export const script = path.resolve(import.meta.dirname, 'structure_metrics.py');

export function pythonUsable(): boolean {
  const interpreter = spawnSync(
    'python3',
    ['-c', 'import sys; print(sys.version_info >= (3, 10))'],
    { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS },
  );
  return interpreter.error === undefined && interpreter.stdout.trim() === 'True';
}

function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [file, content] of Object.entries(files)) {
    const target = path.resolve(root, file);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`${file} is outside ${root}`);
    }
    writeFileSync(target, content);
  }
}

export type StructureMetricsRun = {
  directory: (prefix?: string) => string;
  cleanup: () => void;
  metricsOf: (files: Readonly<Record<string, string>>) => MetricEntry[];
  functionsOf: (source: readonly string[]) => MetricEntry[];
  field: (source: readonly string[], name: string) => unknown[];
};

export function createMetrics(): StructureMetricsRun {
  const directories: string[] = [];

  function directory(prefix = 'nitpicker-structure-metrics-'): string {
    const created = mkdtempSync(path.join(tmpdir(), prefix));
    directories.push(created);
    return created;
  }

  function cleanup(): void {
    for (const created of directories.splice(0)) {
      rmSync(created, { recursive: true, force: true });
    }
  }

  function metricsOf(files: Readonly<Record<string, string>>): MetricEntry[] {
    const root = directory();
    writeFiles(root, files);
    const listing = path.join(root, 'listing.txt');
    writeFileSync(listing, Object.keys(files).join('\n'));
    const output = path.join(root, 'metrics.json');
    const result = spawnSync('python3', [script, output, root, listing], {
      encoding: 'utf8',
      timeout: TOOL_TIMEOUT_MS,
    });
    if (result.status !== 0) {
      throw result.error ?? new Error(result.stderr);
    }
    return parseMetrics(readFileSync(output, 'utf8'));
  }

  function functionsOf(source: readonly string[]): MetricEntry[] {
    return metricsOf({ 'sample.py': `${source.join('\n')}\n` });
  }

  function field(source: readonly string[], name: string): unknown[] {
    return functionsOf(source).map((entry) => entry[name]);
  }

  return { directory, cleanup, metricsOf, functionsOf, field };
}
