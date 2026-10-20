import path from 'node:path';
import { consoleReportEnvironment } from '../console-report.mjs';
import { spawnNodeTool } from '../../quality-areas/runners/tooling.mjs';
import {
  readRun,
  removeTemporary,
  temporaryProjectPath,
  testTimeoutMs,
  workerCount,
} from '../test-run.mjs';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';
import { assertSourcesCovered, coverageArguments, shownRootDir } from './jest-coverage.mjs';
import { jestTool } from './jest-launcher.mjs';
import { jestArguments } from './jest-arguments.mjs';

const SERIAL_OPTIONS = new Set(['--runInBand', '-i']);

function workerArguments(options, tokens) {
  const serial = tokens.some((token) => SERIAL_OPTIONS.has(token.split('=')[0]));
  return serial ? [] : [`--maxWorkers=${String(workerCount(options))}`];
}

function spawnJest(options, command, nitpickerArguments, environment = {}) {
  const launch = jestTool(options, command.launcher);
  return spawnNodeTool({
    options,
    ...launch.tool,
    nodeArguments: command.nodeArguments,
    environment: { ...command.environment, ...environment },
    arguments_: jestArguments(command, nitpickerArguments, launch),
  });
}

export function runJest(options, command) {
  const rootDir = shownRootDir(spawnJest(options, command, ['--showConfig']));
  const reportPath = temporaryProjectPath(options, 'jest-report.json');
  try {
    const result = spawnJest(
      options,
      command,
      [
        '--ci',
        '--no-watchman',
        '--passWithNoTests',
        ...(options.rerun === undefined
          ? coverageArguments(options, rootDir)
          : [
              '--coverage=false',
              '--testNamePattern',
              options.rerun.namePattern,
              '--runTestsByPath',
              ...options.rerun.files,
            ]),
        '--silent=false',
        '--verbose=false',
        '--reporters=default',
        `--reporters=${path.join(import.meta.dirname, 'console-reporter.config.mjs')}`,
        '--json',
        `--outputFile=${reportPath}`,
        '--testLocationInResults',
        `--testTimeout=${String(testTimeoutMs(options))}`,
        '--restoreMocks',
        ...workerArguments(options, command.arguments_),
      ],
      consoleReportEnvironment(options),
    );
    const run = readRun({ reportPath, result, runnerName: RUNNER_NAMES.jest });
    if (!run.failed && run.report.numTotalTests > 0 && options.rerun === undefined) {
      assertSourcesCovered(options, rootDir);
    }
    return run;
  } finally {
    removeTemporary(reportPath);
  }
}
