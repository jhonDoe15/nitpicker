import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Fields, requiredFields } from './json/fields.mts';
import { containedPath } from '../core/fix/common/contained-path.mjs';
import { TOOL_RUN_CEILING_MS } from '../shared/processes/deadlines.mjs';
import { installedVersions } from '../core/diff/tests/analysis/eslint/test-support/eslint-recording-key.mjs';

const toolRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(toolRoot, 'core/diff/fixtures/eslint-recorded-reports.json');

function recordedSnapshots(recordDirectory: string): Fields[] {
  const snapshots = new Map<string, Fields>();
  for (const entry of readdirSync(recordDirectory)) {
    const parsed: unknown = JSON.parse(readFileSync(containedPath(recordDirectory, entry), 'utf8'));
    const record = requiredFields(parsed, entry);
    snapshots.set(JSON.stringify([record['policySha'], record['files']]), record);
  }
  return [...snapshots.values()].sort((left, right) =>
    JSON.stringify([left['policyConfig'], left['files'], left['policySha']]).localeCompare(
      JSON.stringify([right['policyConfig'], right['files'], right['policySha']]),
    ),
  );
}

function recordEslintReports(environment: NodeJS.ProcessEnv): number {
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
        env: { ...environment, NITPICKER_DIFF_RECORD_DIR: recordDirectory },
        stdio: 'inherit',
        timeout: TOOL_RUN_CEILING_MS,
      },
    );
    if (run.status !== 0) {
      throw new Error(`recording run failed with exit status ${String(run.status)}`);
    }
    const sorted = recordedSnapshots(recordDirectory);
    writeFileSync(
      outputPath,
      `${JSON.stringify({ versions: installedVersions(), snapshots: sorted }, null, 2)}\n`,
    );
    const format = spawnSync(
      process.execPath,
      [path.join(toolRoot, 'node_modules/prettier/bin/prettier.cjs'), '--write', outputPath],
      { cwd: toolRoot, stdio: 'inherit', timeout: TOOL_RUN_CEILING_MS },
    );
    if (format.status !== 0) {
      throw new Error(`prettier failed with exit status ${String(format.status)}`);
    }
    return sorted.length;
  } finally {
    rmSync(recordDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const recorded = recordEslintReports(process.env);
  process.stdout.write(`Recorded ${String(recorded)} snapshots to ${outputPath}\n`);
}
