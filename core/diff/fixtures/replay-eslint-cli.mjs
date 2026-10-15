// Stands in for the ESLint CLI in tests by replaying a report recorded from real ESLint.
//
// Re-record after changing a fixture source, a policy config, or upgrading ESLint, typescript-eslint
// or a plugin (the replay refuses with exit code 2 until you do), from the repository root:
//   npm run test:record-eslint
//
// A recording is replayed only for the exact snapshot it was captured from: the installed versions
// of the tracked packages, the policy config hash and every src/main TypeScript file hash must match.
// With NITPICKER_DIFF_RECORD_DIR set this script instead runs the real ESLint and records its report
// there; scripts/record-eslint-reports.mjs drives that and merges the records.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  differingVersions,
  eslintCliPath,
  installedVersions,
  sameKey,
  snapshotKey,
} from '../tests/analysis/eslint/test-support/eslint-recording-key.mjs';

const projectRoot = process.cwd();
const policyConfigPath = requiredEnvironmentPath('NITPICKER_DIFF_ESLINT_POLICY_CONFIG');
const key = snapshotKey(projectRoot, policyConfigPath);

if (process.env.NITPICKER_DIFF_RECORD_DIR) {
  record();
} else {
  replay();
}

function replay() {
  const recordings = JSON.parse(
    readFileSync(requiredEnvironmentPath('NITPICKER_DIFF_REPLAY_RECORDINGS'), 'utf8'),
  );
  const changedVersions = differingVersions(recordings.versions, installedVersions());
  if (changedVersions.length > 0) {
    process.stderr.write(
      `Recorded ESLint reports are stale: installed versions changed (${changedVersions.join(', ')}). ` +
        'Re-record with: npm run test:record-eslint\n',
    );
    process.exitCode = 2;
    return;
  }
  const match = recordings.snapshots.find((snapshot) => sameKey(snapshot, key));
  if (match === undefined) {
    process.stderr.write(
      `No recorded ESLint report matches policy ${policyConfigPath} with the current src/main files ` +
        `(a fixture source or policy config changed). ` +
        'Re-record with: npm run test:record-eslint\n',
    );
    process.exitCode = 2;
    return;
  }
  const results = match.results.map((result) => ({
    ...result,
    filePath: path.join(projectRoot, result.filePath),
  }));
  process.stdout.write(JSON.stringify(results));
  process.exitCode = results.some((result) => result.errorCount > 0) ? 1 : 0;
}

function record() {
  const result = spawnSync(process.execPath, [eslintCliPath(), ...process.argv.slice(2)], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  process.stderr.write(result.stderr);
  process.stdout.write(result.stdout);
  process.exitCode = result.status;
  if (result.status !== 0 && result.status !== 1) {
    return;
  }
  // The embedded source text is dropped: it is large and the diff pipeline reads the file itself.
  const results = JSON.parse(result.stdout).map(({ source: _source, ...report }) => ({
    ...report,
    filePath: path.relative(projectRoot, report.filePath).split(path.sep).join('/'),
  }));
  mkdirSync(process.env.NITPICKER_DIFF_RECORD_DIR, { recursive: true });
  writeFileSync(
    path.join(process.env.NITPICKER_DIFF_RECORD_DIR, `${randomUUID()}.json`),
    JSON.stringify({ ...key, results }),
  );
}

function requiredEnvironmentPath(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} must name a file`);
  }
  return value;
}
