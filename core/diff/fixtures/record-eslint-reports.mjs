// Regenerates eslint-recorded-reports.json from real ESLint. Run from the repository root:
//   node core/diff/fixtures/record-eslint-reports.mjs
// It runs the compare-policy tests with the replay script in record mode (NITPICKER_DIFF_RECORD_DIR),
// so every ESLint run those tests make is executed by the real ESLint and its report is captured.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installedVersions } from './eslint-recording-key.mjs';

const toolRoot = path.resolve(import.meta.dirname, '../../..');
const outputPath = path.join(import.meta.dirname, 'eslint-recorded-reports.json');
const recordDirectory = mkdtempSync(path.join(tmpdir(), 'eslint-records-'));

try {
  const run = spawnSync(
    process.execPath,
    [
      path.join(toolRoot, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      'vitest.config.mts',
      'core/diff/eslint-diff-policy.test.mjs',
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
  // Keep the file in the repository's prettier format so regenerating it yields no formatting noise.
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
