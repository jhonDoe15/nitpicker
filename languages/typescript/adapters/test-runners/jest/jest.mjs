import { spawnNodeTool } from '../../quality-areas/runners/tooling.mjs';
import {
  MAX_WORKERS,
  TEST_TIMEOUT_MS,
  readRun,
  removeTemporary,
  temporaryProjectPath,
} from '../test-run.mjs';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';
import { assertSourcesCovered, coverageArguments, shownRootDir } from './jest-coverage.mjs';
import { jestTool } from './jest-launcher.mjs';
import { jestArguments } from './jest-arguments.mjs';

const SERIAL_OPTIONS = new Set(['--runInBand', '-i']);

function workerArguments(tokens) {
  const serial = tokens.some((token) => SERIAL_OPTIONS.has(token.split('=')[0]));
  return serial ? [] : [`--maxWorkers=${String(MAX_WORKERS)}`];
}

function spawnJest(options, command, nitpickerArguments) {
  const launch = jestTool(options, command.launcher);
  return spawnNodeTool({
    options,
    ...launch.tool,
    nodeArguments: command.nodeArguments,
    environment: command.environment,
    arguments_: jestArguments(command, nitpickerArguments, launch),
  });
}

export function runJest(options, command) {
  const rootDir = shownRootDir(spawnJest(options, command, ['--showConfig']));
  const reportPath = temporaryProjectPath(options, 'jest-report.json');
  try {
    const result = spawnJest(options, command, [
      '--ci',
      '--no-watchman',
      '--passWithNoTests',
      ...coverageArguments(options, rootDir),
      '--json',
      `--outputFile=${reportPath}`,
      '--testLocationInResults',
      `--testTimeout=${String(TEST_TIMEOUT_MS)}`,
      '--restoreMocks',
      ...workerArguments(command.arguments_),
    ]);
    const run = readRun({ reportPath, result, runnerName: RUNNER_NAMES.jest });
    if (!run.failed && run.report.numTotalTests > 0) {
      assertSourcesCovered(options, rootDir);
    }
    return run;
  } finally {
    removeTemporary(reportPath);
  }
}
