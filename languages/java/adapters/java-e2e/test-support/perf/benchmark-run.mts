import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BENCHMARK_TIMEOUT_MS = 280_000;

export type BenchmarkRun = {
  readonly execute: () => void;
  readonly cleanup: () => void;
  readonly output: () => string;
};

export function benchmarkRun(
  gradle: string,
  task: string,
  project: { readonly settings: string; readonly prepare: (root: string) => string },
): BenchmarkRun {
  let root = '';
  let output = '';

  function execute(): void {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-rule-time-'));
    writeFileSync(path.join(root, 'settings.gradle'), project.settings);
    writeFileSync(path.join(root, 'build.gradle'), project.prepare(root));
    const result = spawnSync(gradle, ['--console=plain', '--quiet', task], {
      cwd: root,
      encoding: 'utf8',
      timeout: BENCHMARK_TIMEOUT_MS,
    });
    if (result.error !== undefined) {
      throw result.error;
    }
    output = `${result.stdout}\n${result.stderr}`;
  }

  function cleanup(): void {
    rmSync(root, { recursive: true, force: true });
  }

  return { execute, cleanup, output: () => output };
}
