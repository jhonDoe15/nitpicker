import path from 'node:path';
import { readTestReport, spawnNodeTool, withoutOptions } from '../typed/runner-tools.mts';
import type {
  RunnerCommand,
  TestConsole,
  TestOptions,
  TestReport,
  TestRun,
} from '../typed/runner-types.mts';
import type { NodeToolResult } from '../../static-checks/shared.mts';
import {
  finishedRun,
  removeTemporary,
  temporaryProjectPath,
  testTimeoutMs,
  workerCount,
} from '../test-run.mts';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';
import { assertSourcesCovered, coverageArguments, shownConfig } from './jest-coverage.mts';
import { type JestLaunch, jestTool } from './jest-launcher.mts';
import { consoleProducerPath, jestAssertImport, startTestConsole } from '../test-console-run.mts';

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

function scriptArguments(command: RunnerCommand): string[] {
  return withoutOptions(command.arguments_, OPTIONS_NITPICKER_SETS);
}

export function jestArguments(
  command: RunnerCommand,
  nitpickerArguments: readonly string[],
  { leading, trailing }: Pick<JestLaunch, 'leading' | 'trailing'>,
): string[] {
  return [...leading, ...scriptArguments(command), ...nitpickerArguments, ...trailing];
}

function rerunPaths(options: TestOptions, command: RunnerCommand): string[] {
  const named = new Set(
    scriptArguments(command).map((token) => path.resolve(options.projectRoot, token)),
  );
  return (options.rerun?.files ?? []).filter((file) => !named.has(file));
}

function workerArguments(options: TestOptions, tokens: readonly string[]): string[] {
  const serial = tokens.some((token) => SERIAL_OPTIONS.has(token.split('=')[0] ?? token));
  return serial ? [] : [`--maxWorkers=${String(workerCount(options))}`];
}

function spawnJest(
  options: TestOptions,
  command: RunnerCommand,
  nitpickerArguments: readonly string[],
): NodeToolResult {
  const launch = jestTool(options, command.launcher);
  return spawnNodeTool({
    options,
    ...launch.tool,
    nodeArguments: command.nodeArguments,
    nodeOptions: command.nodeOptions,
    environment: command.environment,
    arguments_: jestArguments(command, nitpickerArguments, launch),
  });
}

function reporterArguments(options: TestOptions, testConsole: TestConsole): string[] {
  return [
    '--reporters=default',
    ...(testConsole.enabled
      ? ['--silent=false', '--verbose=false', `--reporters=${consoleProducerPath(options, 'jest')}`]
      : []),
  ];
}

function consoleCommand(
  options: TestOptions,
  command: RunnerCommand,
  testConsole: TestConsole,
): RunnerCommand {
  return testConsole.enabled
    ? {
        ...command,
        nodeOptions: [jestAssertImport(options)],
        environment: { ...command.environment, ...testConsole.environment },
      }
    : command;
}

function passedEverything(report: TestReport): boolean {
  return (
    report.success === true &&
    report.snapshot?.failure !== true &&
    report.numFailedTests === 0 &&
    report.numFailedTestSuites === 0 &&
    report.numRuntimeErrorTestSuites === 0 &&
    report.wasInterrupted !== true
  );
}

function withoutForcedLateLogExit(
  result: NodeToolResult,
  {
    report,
    printsDirectly,
    testConsole,
  }: {
    readonly report: TestReport;
    readonly printsDirectly: boolean;
    readonly testConsole: TestConsole;
  },
): NodeToolResult {
  const ownRunPrints = printsDirectly || report.numTotalTestSuites === 1;
  const forced =
    testConsole.enabled &&
    ownRunPrints &&
    passedEverything(report) &&
    result.status === 1 &&
    result.stderr.includes(LATE_LOG);
  return forced ? { ...result, status: 0 } : result;
}

export function runJest(options: TestOptions, command: RunnerCommand): TestRun {
  const { rootDir, printsDirectly } = shownConfig(spawnJest(options, command, ['--showConfig']));
  const reportPath = temporaryProjectPath(options, 'jest-report.json');
  const testConsole = startTestConsole(options, { collectsLines: false });
  try {
    const result = spawnJest(options, consoleCommand(options, command, testConsole), [
      '--ci',
      '--no-watchman',
      '--passWithNoTests',
      ...(options.rerun === undefined
        ? coverageArguments(options, rootDir)
        : [
            '--coverage=false',
            ...(options.rerun.namePattern === undefined
              ? []
              : ['--testNamePattern', options.rerun.namePattern]),
            '--runTestsByPath',
            ...rerunPaths(options, command),
          ]),
      '--json',
      `--outputFile=${reportPath}`,
      '--testLocationInResults',
      `--testTimeout=${String(testTimeoutMs(options))}`,
      ...(options.rerun?.withoutMockPin === true ? [] : ['--restoreMocks']),
      ...workerArguments(options, command.arguments_),
      ...reporterArguments(options, testConsole),
    ]);
    const report = readTestReport(reportPath, result, {
      runnerName: RUNNER_NAMES.jest,
      snapshot: options.snapshot,
    });
    const run = finishedRun({
      report,
      result: withoutForcedLateLogExit(result, { report, printsDirectly, testConsole }),
      runnerName: RUNNER_NAMES.jest,
    });
    if (!run.failed && (run.report.numTotalTests ?? 0) > 0 && options.rerun === undefined) {
      assertSourcesCovered(options, rootDir);
    }
    return run;
  } finally {
    removeTemporary(reportPath);
  }
}
