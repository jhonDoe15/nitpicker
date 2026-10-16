import { mkdirSync } from 'node:fs';
import { readTestReport } from '../../quality-areas/reporting/test-report.mjs';
import { spawnNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { withoutOptions } from '../../../preset/test-runner/script-command.mjs';
import { writeV8Coverage } from '../v8-coverage/v8-coverage.mjs';
import {
  TEST_TIMEOUT_MS,
  coverageOutputFile,
  coverageSourceFiles,
  finishedRun,
  removeTemporary,
  runnableTestFiles,
  temporaryProjectPath,
} from '../test-run.mjs';
import { reportFromMocha } from './mocha-report.mjs';

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

export async function runMocha(options, command) {
  const mochaReportPath = temporaryProjectPath(options, 'mocha-output.json');
  const coverageDirectory = temporaryProjectPath(options, 'v8-coverage');
  mkdirSync(coverageDirectory);
  try {
    const result = spawnNodeTool({
      options,
      relativeToolPath: 'mocha/bin/mocha.js',
      nodeArguments: command.nodeArguments,
      environment: { NODE_ENV: 'test', ...command.environment, NODE_V8_COVERAGE: coverageDirectory },
      arguments_: [
        ...withoutOptions(command.arguments_, OPTIONS_NITPICKER_SETS),
        '--reporter',
        'json',
        '--reporter-option',
        `output=${mochaReportPath}`,
        '--timeout',
        String(TEST_TIMEOUT_MS),
        ...runnableTestFiles(options),
      ],
    });
    const run = finishedRun({
      report: reportFromMocha(readTestReport(mochaReportPath, result, 'Mocha'), options.projectRoot),
      result,
      runnerName: 'Mocha',
    });
    if (!run.failed) {
      await writeV8Coverage({
        coverageDirectory,
        sourceFiles: coverageSourceFiles(options),
        outputFile: coverageOutputFile(options),
      });
    }
    return run;
  } finally {
    removeTemporary(mochaReportPath, coverageDirectory);
  }
}
