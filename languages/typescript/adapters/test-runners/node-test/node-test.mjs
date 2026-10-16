import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withoutOptions } from '../../../preset/test-runner/script-command.mjs';
import { writeV8Coverage } from '../v8-coverage/v8-coverage.mjs';
import {
  MAX_WORKERS,
  TEST_TIMEOUT_MS,
  coverageOutputFile,
  coverageSourceFiles,
  readRun,
  removeTemporary,
  runnableTestFiles,
  temporaryProjectPath,
} from '../test-run.mjs';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const REPORTER = pathToFileURL(path.join(import.meta.dirname, 'node-test-reporter.mjs')).href;
const TYPESCRIPT_FILE = /\.[cm]?ts$/u;
const SCRIPT_EXTENSIONS = '{cjs,mjs,js,cts,mts,ts}';
const LOADER_OPTIONS = new Set(['--import', '--require', '-r', '--loader', '--experimental-loader']);

export const NODE_DEFAULT_PATTERNS = [
  `**/*.test.${SCRIPT_EXTENSIONS}`,
  `**/*-test.${SCRIPT_EXTENSIONS}`,
  `**/*_test.${SCRIPT_EXTENSIONS}`,
  `**/test-*.${SCRIPT_EXTENSIONS}`,
  `**/test.${SCRIPT_EXTENSIONS}`,
  `**/test/**/*.${SCRIPT_EXTENSIONS}`,
];

const OPTIONS_NITPICKER_SETS = {
  flags: ['--watch', '--test-only', '--experimental-test-coverage', '--test-update-snapshots'],
  valued: [
    '--test-reporter',
    '--test-reporter-destination',
    '--test-concurrency',
    '--test-timeout',
    '--test-shard',
    '--test-coverage-include',
    '--test-coverage-exclude',
    '--test-coverage-branches',
    '--test-coverage-functions',
    '--test-coverage-lines',
  ],
};

const VALUED_NODE_OPTIONS = new Set([
  '--import',
  '--require',
  '-r',
  '--loader',
  '--experimental-loader',
  '--env-file',
  '--conditions',
  '-C',
  '--test-name-pattern',
  '--test-skip-pattern',
]);

function splitArguments(arguments_) {
  const options = [];
  const patterns = [];
  const pending = { value: false };
  for (const token of arguments_) {
    if (pending.value) {
      options.push(token);
      pending.value = false;
    } else if (token.startsWith('-')) {
      options.push(token);
      pending.value = VALUED_NODE_OPTIONS.has(token);
    } else {
      patterns.push(token);
    }
  }
  return { options, patterns };
}

function typeStrippingArguments(nodeArguments, files) {
  const hasTypeScript = files.some((file) => TYPESCRIPT_FILE.test(file));
  const usesLoader = nodeArguments.some((token) => LOADER_OPTIONS.has(token.split('=')[0]));
  return hasTypeScript && !usesLoader && process.features.typescript === false
    ? ['--experimental-strip-types']
    : [];
}

function testArguments(options, command, reportPath) {
  const { options: scriptOptions, patterns } = splitArguments(
    withoutOptions(command.arguments_, OPTIONS_NITPICKER_SETS),
  );
  const files = runnableTestFiles(options);
  const nodeArguments = [
    ...command.nodeArguments,
    ...typeStrippingArguments(command.nodeArguments, files),
  ];
  return [
    ...nodeArguments,
    '--test',
    `--test-reporter=${REPORTER}`,
    `--test-reporter-destination=${reportPath}`,
    `--test-timeout=${String(TEST_TIMEOUT_MS)}`,
    `--test-concurrency=${String(MAX_WORKERS)}`,
    ...scriptOptions,
    ...(patterns.length === 0 ? NODE_DEFAULT_PATTERNS : patterns),
    ...files,
  ];
}

export async function runNodeTest(options, command) {
  const reportPath = temporaryProjectPath(options, 'node-test-report.json');
  const coverageDirectory = temporaryProjectPath(options, 'v8-coverage');
  mkdirSync(coverageDirectory);
  try {
    const result = spawnSync(process.execPath, testArguments(options, command, reportPath), {
      cwd: options.projectRoot,
      env: {
        NODE_ENV: 'test',
        ...process.env,
        ...command.environment,
        NODE_V8_COVERAGE: coverageDirectory,
      },
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    if (result.error !== undefined) throw result.error;
    const run = readRun({ reportPath, result, runnerName: 'node:test' });
    if (!run.failed) {
      await writeV8Coverage({
        coverageDirectory,
        sourceFiles: coverageSourceFiles(options),
        outputFile: coverageOutputFile(options),
      });
    }
    return run;
  } finally {
    removeTemporary(reportPath, coverageDirectory);
  }
}
