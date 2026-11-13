import { textOf } from '../../../../../shared/values/readers.mts';
import {
  projectTestRetry,
  readTestReportJson,
  spawnNodeTool,
  withoutOptions,
} from '../typed/runner-tools.mts';
import type { NodeToolResult } from '../../static-checks/shared.mts';
import type { RunnerCommand, TestOptions, TestReport, TestRun } from '../typed/runner-types.mts';
import {
  MOCHA_OPTIONS_NITPICKER_SETS,
  RUNNER_NAMES,
} from '../../../preset/test-runner/runners.mjs';
import { startV8Coverage } from '../v8-coverage/v8-coverage-run.mts';
import {
  finishedRun,
  removeTemporary,
  runnableTestFiles,
  temporaryProjectPath,
  testTimeoutMs,
  uncoveredRun,
} from '../test-run.mts';
import { loadFailureReport, mochaReportOf, reportFromMocha } from './mocha-report.mts';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { consoleProducerPath, startTestConsole } from '../test-console-run.mts';

const UNIQUE_FILES = path.join(import.meta.dirname, 'mocha-files.config.mjs');

function mochaReport({
  options,
  mochaReportPath,
  result,
  testFiles,
}: {
  readonly options: TestOptions;
  readonly mochaReportPath: string;
  readonly result: NodeToolResult;
  readonly testFiles: readonly string[];
}): TestReport {
  const loadFailure = existsSync(mochaReportPath)
    ? undefined
    : loadFailureReport(result.stderr, testFiles);
  if (loadFailure !== undefined) {
    return loadFailure;
  }
  return reportFromMocha(
    mochaReportOf(
      readTestReportJson(mochaReportPath, result, {
        runnerName: RUNNER_NAMES.mocha,
        snapshot: options.snapshot,
      }),
    ),
    options.projectRoot,
  );
}

export async function runMocha(options: TestOptions, command: RunnerCommand): Promise<TestRun> {
  const retries = projectTestRetry('mocha') ?? 0;
  const testFiles = options.rerun?.files ?? runnableTestFiles(options);
  const mochaReportPath = temporaryProjectPath(options, 'mocha-output.json');
  const testConsole = startTestConsole(options, { collectsLines: true });
  const coverage =
    options.rerun === undefined ? startV8Coverage(options, command) : uncoveredRun(command);
  try {
    const result = spawnNodeTool({
      options,
      relativeToolPath: 'mocha/bin/mocha.js',
      nodeArguments: [...coverage.nodeArguments, ...command.nodeArguments],
      environment: { ...coverage.environment, ...testConsole.environment },
      arguments_: [
        ...withoutOptions(command.arguments_, MOCHA_OPTIONS_NITPICKER_SETS),
        '--require',
        UNIQUE_FILES,
        ...(testConsole.enabled ? ['--require', consoleProducerPath(options, 'mocha')] : []),
        '--reporter',
        'json',
        '--reporter-option',
        `output=${mochaReportPath}`,
        '--timeout',
        String(testTimeoutMs(options, testFiles)),
        '--retries',
        textOf(retries),
        '--no-bail',
        '--no-forbid-only',
        ...(options.rerun === undefined ? [] : ['--grep', options.rerun.namePattern]),
        ...testFiles,
      ],
    });
    testConsole.finish();
    const run = finishedRun({
      report: mochaReport({ options, mochaReportPath, result, testFiles }),
      result,
      runnerName: RUNNER_NAMES.mocha,
    });
    if (!run.failed) {
      await coverage.write();
    }
    return run;
  } finally {
    removeTemporary(mochaReportPath);
    testConsole.remove();
    coverage.remove();
  }
}
