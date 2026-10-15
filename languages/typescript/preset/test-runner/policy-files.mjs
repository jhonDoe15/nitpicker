import { readdirSync } from 'node:fs';
import path from 'node:path';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../../..');
const SOURCE_DIRECTORIES = [
  'languages/typescript/preset/test-runner',
  'languages/typescript/preset/test-runner/configs',
];

function sourceFilesIn(directory) {
  return readdirSync(path.join(PACKAGE_ROOT, directory))
    .filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
    .sort()
    .map((name) => `${directory}/${name}`);
}

const ADAPTER_DIRECTORIES = [
  'languages/typescript/adapters/test-runners',
  'languages/typescript/adapters/test-runners/runners',
  'languages/typescript/adapters/test-runners/node-test',
];

export const TEST_RUNNER_ADAPTER_FILES = ADAPTER_DIRECTORIES.flatMap(sourceFilesIn);

const TEST_RUNNER_POLICY_FILES = SOURCE_DIRECTORIES.flatMap(sourceFilesIn);

export const HEAD_POLICY_FILES = [
  'languages/typescript/preset/layout.mjs',
  'languages/typescript/preset/head-policy.mjs',
  ...TEST_RUNNER_POLICY_FILES,
];
