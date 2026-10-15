import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installedVersions } from '../core/diff/tests/analysis/eslint/test-support/eslint-recording-key.mjs';

const toolRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(toolRoot, 'core/diff/fixtures/eslint-recorded-reports.json');
const recordDirectory = mkdtempSync(path.join(tmpdir(), 'eslint-records-'));

try {
  const run = spawnSync(
    process.execPath,
    [
      path.join(toolRoot, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      'vitest.config.mts',
      'core/diff/tests/analysis/eslint/',
      '--testTimeout=300000',
    ],
    {
      cwd: toolRoot,
      env: { ...process.env, NITPICKER_DIFF_RECORD_DIR: recordDirectory },
      stdio: 'inherit',
    },
  );
  if (run.status !== 0) {
    throw new Error(`recording run failed with exit status ${String(run.status)}`);
  }
  const snapshots = new Map();
  for (const entry of readdirSync(recordDirectory)) {
    const record = JSON.parse(readFileSync(path.join(recordDirectory, entry), 'utf8'));
    snapshots.set(JSON.stringify([record.policySha, record.files]), record);
  }
  const sorted = [...snapshots.values()].sort((left, right) =>
    JSON.stringify([left.policyConfig, left.files, left.policySha]).localeCompare(
      JSON.stringify([right.policyConfig, right.files, right.policySha]),
    ),
  );
  writeFileSync(
    outputPath,
    `${JSON.stringify({ versions: installedVersions(), snapshots: sorted }, null, 2)}\n`,
  );
  const format = spawnSync(
    process.execPath,
    [path.join(toolRoot, 'node_modules/prettier/bin/prettier.cjs'), '--write', outputPath],
    { cwd: toolRoot, stdio: 'inherit' },
  );
  if (format.status !== 0) {
    throw new Error(`prettier failed with exit status ${String(format.status)}`);
  }
  process.stdout.write(`Recorded ${String(sorted.length)} snapshots to ${outputPath}\n`);
} finally {
  rmSync(recordDirectory, { recursive: true, force: true });
}
