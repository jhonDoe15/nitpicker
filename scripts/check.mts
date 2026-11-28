import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { actionPinProblems } from './action-pins/action-pins.mts';
import { type CheckStep, checkSteps } from './check/check-steps.mts';
import { TOOL_RUN_CEILING_MS } from '../shared/processes/deadlines.mts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

function stepPasses({ args, environment }: CheckStep): boolean {
  const { status } = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    timeout: TOOL_RUN_CEILING_MS,
    env: environment,
  });
  return status === 0;
}

function failedChecks(testArguments: readonly string[], environment: NodeJS.ProcessEnv): string[] {
  const failedSteps = checkSteps(testArguments, environment)
    .filter((step) => !stepPasses(step))
    .map(({ name }) => name);
  return [...actionPinProblems(repositoryRoot), ...failedSteps];
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const failed = failedChecks(process.argv.slice(2), process.env);
  if (failed.length > 0) {
    process.stderr.write(`check failed: ${failed.join(', ')}\n`);
    process.exitCode = 1;
  }
}
