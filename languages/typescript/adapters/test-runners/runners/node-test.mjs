import path from 'node:path';
import { readLayout } from '../../../preset/head-policy.mjs';
import { codeExtensionNames, existingRoots } from '../../../preset/layout.mjs';
import { readManifest, testScripts } from '../../../preset/test-runner/evidence.mjs';
import { nodeTestArgumentsOf } from './node-arguments.mjs';
import { runNodeTool } from '../tool-process.mjs';
import {
  COVERAGE_DIRECTORY,
  coverageExcludeGlobs,
  coverageIncludeGlobs,
  TEST_TIMEOUT_MS,
  TEST_WORKERS,
} from '../coverage-globs.mjs';

const REPORTER_PATH = path.join(import.meta.dirname, '../node-test/reporter.mjs');

function repeated(flag, values) {
  return values.map((value) => `${flag}=${value}`);
}

export function runNodeTestWithCoverage({ options, reportPath, register }) {
  const layout = readLayout();
  const temporaryDirectory = register(path.join(options.projectRoot, '.nitpicker-diff-c8'));
  const testFiles = layout.projectCodeFiles(options.projectRoot).filter(layout.isRunnableTestFile);
  const nodeArguments = nodeTestArgumentsOf(testScripts(readManifest(options.projectRoot)));
  return runNodeTool({
    options,
    relativeToolPath: 'c8/bin/c8.js',
    arguments_: [
      '--all',
      ...repeated('--src', existingRoots(options.projectRoot, layout.sourceRoots)),
      ...repeated('--include', coverageIncludeGlobs(layout)),
      ...repeated('--exclude', coverageExcludeGlobs(layout)),
      ...repeated(
        '--extension',
        codeExtensionNames.map((extension) => `.${extension}`),
      ),
      '--reporter=json',
      `--reports-dir=${COVERAGE_DIRECTORY}`,
      `--temp-directory=${temporaryDirectory}`,
      process.execPath,
      ...nodeArguments,
      '--test',
      `--test-reporter=${REPORTER_PATH}`,
      `--test-reporter-destination=${reportPath}`,
      `--test-concurrency=${String(TEST_WORKERS)}`,
      `--test-timeout=${String(TEST_TIMEOUT_MS)}`,
      ...testFiles,
    ],
    acceptedStatuses: [0, 1],
  });
}
