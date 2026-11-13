import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { actionPinProblems } from './action-pins/action-pins.mts';
import { TOOL_RUN_CEILING_MS } from '../shared/processes/deadlines.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

function failedSteps(testArguments: readonly string[]): string[] {
  const steps: readonly (readonly [string, readonly string[]])[] = [
    ['self-gate', ['core/cli.mts']],
    [
      'tests',
      ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.mts', ...testArguments],
    ],
  ];
  return steps
    .map(([name, args]) => ({
      name,
      status: spawnSync(process.execPath, args, {
        cwd: repositoryRoot,
        stdio: 'inherit',
        timeout: TOOL_RUN_CEILING_MS,
      }).status,
    }))
    .filter(({ status }) => status !== 0)
    .map(({ name }) => name);
}

function failedChecks(testArguments: readonly string[]): string[] {
  return [...actionPinProblems(repositoryRoot), ...failedSteps(testArguments)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const failed = failedChecks(process.argv.slice(2));
  if (failed.length > 0) {
    process.stderr.write(`check failed: ${failed.join(', ')}\n`);
    process.exitCode = 1;
  }
}
