import { spawnNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { withoutOptions } from '../../../preset/test-runner/script-command.mjs';
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
    '--findRelatedTests',
    '--showConfig',
    '--listTests',
    '--clearCache',
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
    '--shard',
    '--testNamePattern',
    '-t',
  ],
};

const SERIAL_OPTIONS = new Set(['--runInBand', '-i']);

function withoutRelatedFiles(tokens) {
  const kept = [];
  let related = false;
  for (const token of tokens) {
    if (token.startsWith('-')) {
      related = token === '--findRelatedTests';
    }
    if (!related || token.startsWith('-')) {
      kept.push(token);
    }
  }
  return kept;
}

export function jestArguments(command, nitpickerArguments, { leading, trailing }) {
  return [
    ...leading,
    ...withoutOptions(withoutRelatedFiles(command.arguments_), OPTIONS_NITPICKER_SETS),
    ...nitpickerArguments,
    ...trailing,
  ];
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

export function runJest(options, command) {
  const rootDir = shownRootDir(spawnJest(options, command, ['--showConfig']));
  const reportPath = temporaryProjectPath(options, 'jest-report.json');
  try {
    const result = spawnJest(options, command, [
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
      '--json',
      `--outputFile=${reportPath}`,
      '--testLocationInResults',
      `--testTimeout=${String(testTimeoutMs(options))}`,
      '--restoreMocks',
      ...workerArguments(options, command.arguments_),
    ]);
    const run = readRun({ reportPath, result, runnerName: RUNNER_NAMES.jest });
    if (!run.failed && run.report.numTotalTests > 0 && options.rerun === undefined) {
      assertSourcesCovered(options, rootDir);
    }
    return run;
  } finally {
    removeTemporary(reportPath);
  }
}
