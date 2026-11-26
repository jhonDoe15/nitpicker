import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { actionPinProblems } from './action-pins/action-pins.mts';
import { TOOL_RUN_CEILING_MS } from '../shared/processes/deadlines.mts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

const TEST_RESULTS = 'reports/test-results';

const RECORDED_RESULTS = [
  '--coverage',
  '--coverage.reporter=json',
  `--coverage.reportsDirectory=${TEST_RESULTS}`,
  '--reporter=default',
  '--reporter=json',
  `--outputFile.json=${TEST_RESULTS}/test-report.json`,
];

function stepStatus(args: readonly string[], environment: NodeJS.ProcessEnv): number | undefined {
  const { status } = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    timeout: TOOL_RUN_CEILING_MS,
    env: environment,
  });
  return status ?? undefined;
}

function failedSteps(testArguments: readonly string[], environment: NodeJS.ProcessEnv): string[] {
  const whole = testArguments.length === 0;
  const tests = stepStatus(
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'vitest.config.mts',
      ...(whole ? RECORDED_RESULTS : testArguments),
    ],
    environment,
  );
  const gate = stepStatus(
    ['core/cli.mts', ...(whole ? [] : ['--quick'])],
    whole ? { ...environment, NITPICKER_TEST_RESULTS: TEST_RESULTS } : environment,
  );
  return [...(gate === 0 ? [] : ['self-gate']), ...(tests === 0 ? [] : ['tests'])];
}

function failedChecks(testArguments: readonly string[], environment: NodeJS.ProcessEnv): string[] {
  return [...actionPinProblems(repositoryRoot), ...failedSteps(testArguments, environment)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const failed = failedChecks(process.argv.slice(2), process.env);
  if (failed.length > 0) {
    process.stderr.write(`check failed: ${failed.join(', ')}\n`);
    process.exitCode = 1;
  }
}
