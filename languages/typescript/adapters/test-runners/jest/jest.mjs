import path from 'node:path';
import { spawnNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { withoutOptions } from '../../../preset/test-runner/script-command.mjs';
import { readTestReport } from '../../quality-areas/reporting/test-report.mjs';
import {
  finishedRun,
  removeTemporary,
  temporaryProjectPath,
  testTimeoutMs,
  workerCount,
} from '../test-run.mjs';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';
import { assertSourcesCovered, coverageArguments, shownConfig } from './jest-coverage.mjs';
import { jestTool } from './jest-launcher.mjs';
import { consoleProducerPath, startTestConsole } from '../test-console-run.mjs';

const LATE_LOG = 'Cannot log after tests are done';

const OPTIONS_NITPICKER_SETS = {
  flags: [
    '--watch',
    '--watchAll',
    '--coverage',
    '--collectCoverage',
    '--json',
    '--ci',
    '--silent',
    '--passWithNoTests',
    '--onlyChanged',
    '-o',
    '--onlyFailures',
    '-f',
    '--lastCommit',
    '--changedFilesWithAncestor',
    '--showConfig',
    '--listTests',
    '--clearCache',
  ],
  valued: [
    '--outputFile',
    '--coverageDirectory',
    '--coverageProvider',
    '--coverageThreshold',
    '--testTimeout',
    '--maxWorkers',
    '-w',
    '--changedSince',
    '--shard',
    '--testNamePattern',
    '-t',
  ],
  variadic: [
    '--findRelatedTests',
    '--collectCoverageFrom',
    '--coveragePathIgnorePatterns',
    '--coverageReporters',
    '--reporters',
  ],
};

const SERIAL_OPTIONS = new Set(['--runInBand', '-i']);

function scriptArguments(command) {
  return withoutOptions(command.arguments_, OPTIONS_NITPICKER_SETS);
}

export function jestArguments(command, nitpickerArguments, { leading, trailing }) {
  return [...leading, ...scriptArguments(command), ...nitpickerArguments, ...trailing];
}

function rerunPaths(options, command) {
  const named = new Set(
    scriptArguments(command).map((token) => path.resolve(options.projectRoot, token)),
  );
  return options.rerun.files.filter((file) => !named.has(file));
}

function workerArguments(options, tokens) {
  const serial = tokens.some((token) => SERIAL_OPTIONS.has(token.split('=')[0]));
  return serial ? [] : [`--maxWorkers=${String(workerCount(options))}`];
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

function consoleArguments(options, testConsole) {
  return testConsole.enabled
    ? [
        '--silent=false',
        '--verbose=false',
        '--reporters=default',
        `--reporters=${consoleProducerPath(options, 'jest')}`,
      ]
    : [];
}

function passedEverything(report) {
  return (
    report?.success === true &&
    report.snapshot?.failure !== true &&
    report.numFailedTests === 0 &&
    report.numFailedTestSuites === 0 &&
    report.numRuntimeErrorTestSuites === 0 &&
    report.wasInterrupted !== true
  );
}

function withoutForcedLateLogExit(result, { report, printsDirectly, testConsole }) {
  const ownRunPrints = printsDirectly || report?.numTotalTestSuites === 1;
  const forced =
    testConsole.enabled &&
    ownRunPrints &&
    passedEverything(report) &&
    result.status === 1 &&
    result.stderr.includes(LATE_LOG);
  return forced ? { ...result, status: 0 } : result;
}

export function runJest(options, command) {
  const { rootDir, printsDirectly } = shownConfig(spawnJest(options, command, ['--showConfig']));
  const reportPath = temporaryProjectPath(options, 'jest-report.json');
  const testConsole = startTestConsole(options, { collectsLines: false });
  try {
    const result = spawnJest(
      options,
      { ...command, environment: { ...command.environment, ...testConsole.environment } },
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
              ...rerunPaths(options, command),
            ]),
        '--json',
        `--outputFile=${reportPath}`,
        '--testLocationInResults',
        `--testTimeout=${String(testTimeoutMs(options))}`,
        '--restoreMocks',
        ...workerArguments(options, command.arguments_),
        ...consoleArguments(options, testConsole),
      ],
    );
    const report = readTestReport(reportPath, result, {
      runnerName: RUNNER_NAMES.jest,
      snapshot: options.snapshot,
    });
    const run = finishedRun({
      report,
      result: withoutForcedLateLogExit(result, { report, printsDirectly, testConsole }),
      runnerName: RUNNER_NAMES.jest,
    });
    if (!run.failed && run.report.numTotalTests > 0 && options.rerun === undefined) {
      assertSourcesCovered(options, rootDir);
    }
    return run;
  } finally {
    removeTemporary(reportPath);
  }
}
