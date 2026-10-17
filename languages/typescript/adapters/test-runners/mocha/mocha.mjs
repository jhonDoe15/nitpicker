import { readTestReport } from '../../quality-areas/reporting/test-report.mjs';
import { spawnNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { withoutOptions } from '../../../preset/test-runner/script-command.mjs';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';
import { startV8Coverage } from '../v8-coverage/v8-coverage-run.mjs';
import {
  TEST_TIMEOUT_MS,
  finishedRun,
  removeTemporary,
  runnableTestFiles,
  temporaryProjectPath,
} from '../test-run.mjs';
import { loadFailureReport, reportFromMocha } from './mocha-report.mjs';
import { existsSync } from 'node:fs';

const OPTIONS_NITPICKER_SETS = {
  flags: ['--watch', '-w', '--forbid-only', '--bail', '-b'],
  valued: [
    '--reporter',
    '-R',
    '--reporter-option',
    '--reporter-options',
    '-O',
    '--timeout',
    '-t',
    '--watch-files',
    '--watch-ignore',
  ],
};

function mochaReport({ options, mochaReportPath, result, testFiles }) {
  const loadFailure = existsSync(mochaReportPath)
    ? undefined
    : loadFailureReport(result.stderr, testFiles);
  if (loadFailure !== undefined) {
    return loadFailure;
  }
  return reportFromMocha(
    readTestReport(mochaReportPath, result, RUNNER_NAMES.mocha),
    options.projectRoot,
  );
}

export async function runMocha(options, command) {
  const testFiles = runnableTestFiles(options);
  const mochaReportPath = temporaryProjectPath(options, 'mocha-output.json');
  const coverage = startV8Coverage(options, command);
  try {
    const result = spawnNodeTool({
      options,
      relativeToolPath: 'mocha/bin/mocha.js',
      nodeArguments: [...coverage.nodeArguments, ...command.nodeArguments],
      environment: coverage.environment,
      arguments_: [
        ...withoutOptions(command.arguments_, OPTIONS_NITPICKER_SETS),
        '--reporter',
        'json',
        '--reporter-option',
        `output=${mochaReportPath}`,
        '--timeout',
        String(TEST_TIMEOUT_MS),
        ...testFiles,
      ],
    });
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
    coverage.remove();
  }
}
