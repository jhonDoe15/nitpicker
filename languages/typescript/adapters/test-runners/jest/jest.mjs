import { spawnNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { withoutOptions } from '../../../preset/test-runner/script-command.mjs';
import {
  MAX_WORKERS,
  TEST_TIMEOUT_MS,
  coverageGlobs,
  coverageOutputFile,
  readRun,
  removeTemporary,
  temporaryProjectPath,
} from '../test-run.mjs';
import path from 'node:path';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';

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
  ],
  valued: [
    '--outputFile',
    '--coverageDirectory',
    '--coverageReporters',
    '--coverageProvider',
    '--collectCoverageFrom',
    '--coverageThreshold',
    '--reporters',
    '--testTimeout',
    '--maxWorkers',
    '-w',
    '--changedSince',
  ],
};

function coverageArguments(options) {
  const { include, exclude } = coverageGlobs();
  return [
    '--coverage',
    '--coverageProvider=babel',
    '--coverageReporters=json',
    `--coverageDirectory=${path.dirname(coverageOutputFile(options))}`,
    '--coverageThreshold={}',
    ...[...include, ...exclude.map((glob) => `!${glob}`)].map(
      (glob) => `--collectCoverageFrom=${glob}`,
    ),
  ];
}

export function runJest(options, command) {
  const reportPath = temporaryProjectPath(options, 'jest-report.json');
  try {
    const result = spawnNodeTool({
      options,
      relativeToolPath: 'jest/bin/jest.js',
      nodeArguments: command.nodeArguments,
      environment: command.environment,
      arguments_: [
        ...withoutOptions(command.arguments_, OPTIONS_NITPICKER_SETS),
        '--ci',
        '--no-watchman',
        '--passWithNoTests',
        ...coverageArguments(options),
        '--json',
        `--outputFile=${reportPath}`,
        '--testLocationInResults',
        `--testTimeout=${String(TEST_TIMEOUT_MS)}`,
        '--restoreMocks',
        `--maxWorkers=${String(MAX_WORKERS)}`,
      ],
    });
    return readRun({ reportPath, result, runnerName: RUNNER_NAMES.jest });
  } finally {
    removeTemporary(reportPath);
  }
}
