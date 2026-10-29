import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { actionPinProblems } from './action-pins.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const pinProblems = actionPinProblems(repositoryRoot);

const steps = [
  ['self-gate', ['core/cli.mjs']],
  [
    'tests',
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'vitest.config.mts',
      ...process.argv.slice(2),
    ],
  ],
];

const failed = [
  ...pinProblems,
  ...steps
    .map(([name, args]) => ({
      name,
      status: spawnSync(process.execPath, args, { cwd: repositoryRoot, stdio: 'inherit' }).status,
    }))
    .filter(({ status }) => status !== 0)
    .map(({ name }) => name),
];

if (failed.length > 0) {
  console.error(`check failed: ${failed.join(', ')}`);
  process.exitCode = 1;
}
